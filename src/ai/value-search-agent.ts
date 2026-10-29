import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import type { Pokemon } from '../pokemon.js';
import { getLegalActions } from './battle-agent.js';
import type { BattleSession } from '../battle-runner.js';
import type { AgentAction } from '../types.js';
import { applyEstimatedStats, compatibleSets, defaultBelief } from './opponent-belief.js';
import type { Belief } from './opponent-belief.js';
import { HeuristicV1BattleAgent } from './baselines/heuristic-v1.js';
import { SeededRandom } from '../rng.js';
import { createMove } from '../move.js';

// 学習した勝率予測 V(s) を使った1手先読み。
//
// 各候補手について局面を複製し、「自分はその手・相手は現行方策（ベースラインv1）」で
// 1ターン進めて、結果の状態を V で評価する。相手の手はベースラインの予測で固定するので、
// 同時手のナッシュ均衡ではなく「相手が現行方策で来る前提の最善応手」を選ぶ。
class ScriptedAgent implements BattleAgent {
  private pending: AgentAction | null;

  constructor(action: AgentAction | null) {
    this.pending = action;
  }

  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) {
    return team[0];
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    if (!context.mustSwitch && this.pending !== null) {
      const action = this.pending;
      this.pending = null;
      return { action };
    }
    // 強制交代・pivot交代は先頭の合法手で済ませる（探索対象外）。
    const legal = getLegalActions(context);
    const switchTarget = legal.switches[0];
    if (switchTarget !== undefined) return { action: { type: 'switch', pokemonIndex: switchTarget.index } };
    const move = legal.moves[0];
    return { action: move === undefined ? { type: 'forfeit' } : { type: 'move', moveIndex: move.index, target: 0 } };
  }
}

export interface ValueSearchOptions {
  // 相手の行動予測に使う方策。既定は凍結ベースライン（＝現行方策と同族）。
  opponentModel?: BattleAgent;
  // 相手の手の扱い。
  //   'model'   相手方策の1手だけを想定（相手を知っている前提。実戦では使えない）
  //   'uniform' 相手の合法手すべてを等確率とみなして平均（相手の政策を知らない）
  //   'worst'   相手の合法手のうち自分にとって最悪の結果
  //   'maximin' 'worst' の別名（CLI で --mode=maximin と書けるように）
  //   'belief'  相手の型の信念（候補セット）から、ありうる手を列挙して平均（伏せ情報を使わない）
  opponentMode?: 'model' | 'uniform' | 'worst' | 'maximin' | 'belief';
  // 信念。既定はメタ構築プールから作る。
  belief?: Belief;
  // 探索する候補の上限（計算時間の制御）。0 なら全候補。
  maxCandidates?: number;
  // 信頼領域: ベースライン方策の手より V が margin 以上良くない限り、ベースラインの手を選ぶ。
  // 学習した V は「ベースラインが訪れる状態」でしか較正されていないため、貪欲に最大化すると
  // 分布外の状態に踏み込み、過大評価された手を選び続ける（クエスピクシー構築で実測）。
  trustMargin?: number; // 既定 0.05（学習分布を広げた V での実測最良）
  // 'oracle'（既定。これまでの評価条件）: 探索の複製が本番と同じ乱数を使い、相手の手は相手自身の視点（本当の技構成）から列挙する。
  // 'fair': 探索の複製だけ乱数を引き直し、相手の未公開の技・持ち物・特性は信念（候補セット）で埋める。人間との対戦用。
  fairness?: 'oracle' | 'fair';
  // 局面の勝率関数（学習した V）。エンジンは学習済みの木を持たないので必須。
  // 木の JSON からは makeValueEvaluator で作る。
  evaluate: (context: BattleContext) => number;
}

export class ValueSearchBattleAgent implements BattleAgent {
  private readonly opponentModel: BattleAgent;
  // fair のとき、探索の複製に与える乱数の seed。手番ごとに1つ引き、その手番の全候補で共有する（候補どうしを同じ乱数で比べる）。
  private searchSeed = 0;

  constructor(private readonly rng: SeededRandom, private readonly options: ValueSearchOptions) {
    this.opponentModel = options.opponentModel ?? new HeuristicV1BattleAgent(new SeededRandom(7));
  }

  private get fair(): boolean {
    return this.options.fairness === 'fair';
  }

  private forkOf(session: BattleSession): BattleSession {
    return this.fair ? session.fork({ rngSeed: this.searchSeed }) : session.fork();
  }

  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) {
    return this.opponentModel.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const session = context.session;
    const side = context.side;
    if (session === undefined || side === undefined || context.mustSwitch) {
      return this.opponentModel.selectAction(context);
    }

    const legal = getLegalActions(context);
    const candidates: { action: AgentAction; label: string }[] = [];
    for (const move of legal.moves) {
      candidates.push({
        action: { type: 'move', moveIndex: move.index, target: 0, megaEvolve: legal.canMegaEvolve || undefined },
        label: move.move.name,
      });
    }
    for (const target of legal.switches) {
      candidates.push({ action: { type: 'switch', pokemonIndex: target.index }, label: `交代:${target.pokemon.name}` });
    }
    if (candidates.length === 0) return this.opponentModel.selectAction(context);
    if (this.fair) this.searchSeed = Math.floor(this.rng.next() * 4294967296);

    const limit = this.options.maxCandidates ?? 0;
    const evaluated = limit > 0 ? candidates.slice(0, limit) : candidates;

    let bestValue = -Infinity;
    let bestAction: AgentAction = evaluated[0].action;
    let bestLabel = evaluated[0].label;
    for (const candidate of evaluated) {
      const value = await this.evaluate(session, side, candidate.action);
      if (value > bestValue) {
        bestValue = value;
        bestAction = candidate.action;
        bestLabel = candidate.label;
      }
    }

    const margin = this.options.trustMargin ?? 0.05;
    if (margin > 0) {
      const fallback = await this.opponentModel.selectAction(context);
      const fallbackValue = await this.evaluate(session, side, fallback.action);
      if (bestValue - fallbackValue < margin) {
        return {
          action: fallback.action,
          reasoning: `1手先読み: ベースライン採用 (差 ${((bestValue - fallbackValue) * 100).toFixed(1)}pt < ${(margin * 100).toFixed(0)}pt)`,
        };
      }
    }

    return { action: bestAction, reasoning: `1手先読み: ${bestLabel} (勝率 ${(bestValue * 100).toFixed(1)}%)` };
  }

  private async evaluate(session: BattleSession, side: 0 | 1, action: AgentAction): Promise<number> {
    // 既定は maximin。相手方策を読む 'model' は実戦では使えないので既定にしない
    // （実測: 'worst' 84.5% / 'belief' 78.8% 対 凍結v1、プールでも 'worst' が 'belief' に59.1%）。
    const mode = this.options.opponentMode ?? 'worst';
    if (mode === 'belief' || (this.fair && mode !== 'model')) {
      const scenarios = this.fair
        ? fairOpponentScenarios(session.getContext(side), this.options.belief ?? session.beliefOf(side))
        : this.beliefScenarios(session.fork(), side);
      if (scenarios.length === 0) return -Infinity;
      if (mode !== 'belief') {
        // fair の uniform / worst: 信念から作った相手の手について平均または最悪値。
        let sum = 0;
        let worst = Infinity;
        for (const scenario of scenarios) {
          const value = await this.simulateWith(this.forkOf(session), side, action, scenario);
          sum += value;
          worst = Math.min(worst, value);
        }
        return mode === 'worst' || mode === 'maximin' ? worst : sum / scenarios.length;
      }
      let sum = 0;
      for (const scenario of scenarios) {
        sum += await this.simulateWith(this.forkOf(session), side, action, scenario);
      }
      return sum / scenarios.length;
    }
    if (mode === 'model') {
      const fork = this.forkOf(session);
      const other = side === 0 ? 1 : 0;
      const opponentDecision = await this.opponentModel.selectAction(fork.getContext(other));
      return this.simulate(fork, side, action, opponentDecision.action);
    }

    // 相手の合法手を列挙して、平均（uniform）または最悪値（worst）を取る。
    const probe = session.fork();
    const other = side === 0 ? 1 : 0;
    const opponentActions = this.enumerateActions(probe.getContext(other));
    if (opponentActions.length === 0) return -Infinity;
    let sum = 0;
    let worst = Infinity;
    for (const opponentAction of opponentActions) {
      const value = await this.simulate(this.forkOf(session), side, action, opponentAction);
      sum += value;
      worst = Math.min(worst, value);
    }
    return mode === 'worst' || mode === 'maximin' ? worst : sum / opponentActions.length;
  }

  // 診断用: 指定した手を打ったときの V 値（相手モデルは options.opponentMode に従う）。
  // selectAction と違い「選ばなかった手」の値も取れるので、ΔV と実際の Δ勝率を比べられる。
  async valueOf(context: BattleContext, action: AgentAction): Promise<number> {
    if (context.session === undefined || context.side === undefined) return Number.NaN;
    return this.evaluate(context.session, context.side, action);
  }

  // 相手の型の信念から「ありうる手」の場面を作る。
  // 候補セットごとに技4つ、加えて交代（ベンチに残っている全員）を1つずつ。
  // 実際の技構成・PPは見ないので、不完全情報モードでも情報が漏れない。
  private beliefScenarios(fork: BattleSession, side: 0 | 1): OpponentScenario[] {
    return opponentScenarios(fork.getContext(side), this.options.belief ?? fork.beliefOf(side));
  }

  private async simulateWith(
    fork: BattleSession,
    side: 0 | 1,
    action: AgentAction,
    scenario: OpponentScenario,
  ): Promise<number> {
    const opponent = side === 0 ? fork.activeB : fork.activeA;
    // 複製の中の相手は実物なので、能力値も見積もりに置き換える（先読みのダメージ・素早さの順番に実際の配分を使わない）。
    for (const pokemon of side === 0 ? fork.teamB : fork.teamA) {
      applyEstimatedStats(pokemon, fork.opponentStats, this.options.belief ?? fork.beliefOf(side));
    }
    if (scenario.moves !== null) {
      opponent.moves = scenario.moves.map((move) => ({ ...move }));
    }
    if (scenario.item !== undefined) opponent.item = scenario.item;
    if (scenario.ability !== undefined) opponent.ability = scenario.ability;
    return this.simulate(fork, side, action, scenario.action);
  }

  private enumerateActions(context: BattleContext): AgentAction[] {
    const legal = getLegalActions(context);
    const actions: AgentAction[] = legal.moves.map((move) => ({ type: 'move' as const, moveIndex: move.index, target: 0 }));
    for (const target of legal.switches) actions.push({ type: 'switch', pokemonIndex: target.index });
    return actions;
  }

  private async simulate(
    fork: BattleSession,
    side: 0 | 1,
    action: AgentAction,
    opponentAction: AgentAction,
  ): Promise<number> {
    const mine = new ScriptedAgent(action);
    const theirs = new ScriptedAgent(opponentAction);
    try {
      if (side === 0) await fork.playTurn(mine, theirs);
      else await fork.playTurn(theirs, mine);
    } catch {
      return -Infinity; // 不正な手は選ばない
    }
    if (fork.isFinished()) return fork.winner() === side ? 1 : 0;
    return this.options.evaluate(fork.getContext(side));
  }
}

// 信念から相手の「ありうる手」を列挙する（純関数。テストで不変条件を固定する）。
// 相手の実際の技構成・PPは見ない。開示済みの技と矛盾しない候補セットだけを使う。
export function opponentScenarios(
  context: BattleContext,
  belief: Belief = defaultBelief(),
): { moves: Pokemon['moves'] | null; action: AgentAction }[] {
  const sets = compatibleSets(context.opponent, belief);
  const scenarios: { moves: Pokemon['moves'] | null; action: AgentAction }[] = [];

  for (const set of sets) {
    for (let index = 0; index < set.moves.length; index++) {
      scenarios.push({ moves: set.moves, action: { type: 'move', moveIndex: index, target: 0 } });
    }
  }
  if (scenarios.length === 0) {
    // 信念に候補が無い種族は、開示済みの技だけを対象にする。
    for (let index = 0; index < context.opponent.moves.length; index++) {
      scenarios.push({ moves: null, action: { type: 'move', moveIndex: index, target: 0 } });
    }
  }
  context.opponentTeam.forEach((pokemon, index) => {
    if (pokemon.isFainted || pokemon.name === context.opponent.name) return;
    scenarios.push({ moves: null, action: { type: 'switch', pokemonIndex: index } });
  });
  return scenarios;
}

// 相手の手の場面。moves / item / ability があれば、探索の複製の中で相手の場のポケモンをその値に置き換える。
export interface OpponentScenario {
  moves: Pokemon['moves'] | null;
  item?: Pokemon['item'];
  ability?: Pokemon['ability'];
  action: AgentAction;
}

// fair モードの相手の手。context は探索する側から見た盤面（不完全情報なら相手は公開済みの技・持ち物・特性だけ）。
// 信念の候補セットごとに技4つ（未公開の持ち物・特性もその候補の値で埋める）と、交代を1つずつ。
// 信念に候補が無い種族は、公開済みの技と、まだ技が見えていなければタイプ一致の仮の技を1つ使う。
export function fairOpponentScenarios(context: BattleContext, belief: Belief = defaultBelief()): OpponentScenario[] {
  const opponent = context.opponent;
  const sets = compatibleSets(opponent, belief);
  const scenarios: OpponentScenario[] = [];
  const knownItem = opponent.item !== null;
  const knownAbility = opponent.ability !== 'none';

  for (const set of sets) {
    for (let index = 0; index < set.moves.length; index++) {
      scenarios.push({
        moves: set.moves,
        item: knownItem ? undefined : set.item,
        ability: knownAbility ? undefined : set.ability,
        action: { type: 'move', moveIndex: index, target: 0 },
      });
    }
  }
  if (scenarios.length === 0) {
    const moves = opponent.moves.length > 0 ? opponent.moves : [placeholderMove(opponent)];
    for (let index = 0; index < moves.length; index++) {
      scenarios.push({ moves, action: { type: 'move', moveIndex: index, target: 0 } });
    }
  }
  // 不完全情報では、相手の選出のうちまだ場に出ていない控えは分からない（見えるのは6体の見せ合いまで）。交代先は場に出たものだけ。
  const hideUnseen = context.session?.information === 'partial';
  context.opponentTeam.forEach((pokemon, index) => {
    if (pokemon.isFainted || pokemon.name === opponent.name) return;
    if (hideUnseen && !pokemon.hasAppeared) return;
    scenarios.push({ moves: null, action: { type: 'switch', pokemonIndex: index } });
  });
  return scenarios;
}

// 技が1つも見えていない、信念にも無い相手の仮の技: 第1タイプの威力80、攻撃と特攻の高いほうの分類。
function placeholderMove(pokemon: Pokemon): Pokemon['moves'][number] {
  const physical = pokemon.baseStats.ATK >= pokemon.baseStats.SPATK;
  return createMove({ name: '（仮の技）', type: pokemon.types[0] ?? 'normal', power: 80, accuracy: 100, pp: 16, category: physical ? 'physical' : 'special' });
}
