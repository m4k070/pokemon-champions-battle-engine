import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import type { Pokemon } from '../pokemon.js';
import { getLegalActions } from './battle-agent.js';
import type { BattleSession } from '../battle-runner.js';
import type { AgentAction } from '../types.js';
import { evaluateValue } from './value-function.js';
import { compatibleSets, defaultBelief } from './opponent-belief.js';
import type { Belief } from './opponent-belief.js';
import { HeuristicV1BattleAgent } from './baselines/heuristic-v1.js';
import { SeededRandom } from '../rng.js';

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
    return team[0]!;
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
}

export class ValueSearchBattleAgent implements BattleAgent {
  private readonly opponentModel: BattleAgent;

  constructor(_rng: SeededRandom = new SeededRandom(1), private readonly options: ValueSearchOptions = {}) {
    this.opponentModel = options.opponentModel ?? new HeuristicV1BattleAgent(new SeededRandom(7));
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

    const limit = this.options.maxCandidates ?? 0;
    const evaluated = limit > 0 ? candidates.slice(0, limit) : candidates;

    let bestValue = -Infinity;
    let bestAction: AgentAction = evaluated[0]!.action;
    let bestLabel = evaluated[0]!.label;
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
    if (mode === 'belief') {
      const scenarios = this.beliefScenarios(session.fork(), side);
      if (scenarios.length === 0) return -Infinity;
      let sum = 0;
      for (const scenario of scenarios) {
        sum += await this.simulateWith(session.fork(), side, action, scenario);
      }
      return sum / scenarios.length;
    }
    if (mode === 'model') {
      const fork = session.fork();
      const other = (side === 0 ? 1 : 0) as 0 | 1;
      const opponentDecision = await this.opponentModel.selectAction(fork.getContext(other));
      return this.simulate(fork, side, action, opponentDecision.action);
    }

    // 相手の合法手を列挙して、平均（uniform）または最悪値（worst）を取る。
    const probe = session.fork();
    const other = (side === 0 ? 1 : 0) as 0 | 1;
    const opponentActions = this.enumerateActions(probe.getContext(other));
    if (opponentActions.length === 0) return -Infinity;
    let sum = 0;
    let worst = Infinity;
    for (const opponentAction of opponentActions) {
      const value = await this.simulate(session.fork(), side, action, opponentAction);
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
  private beliefScenarios(fork: BattleSession, side: 0 | 1): { moves: Pokemon['moves'] | null; action: AgentAction }[] {
    return opponentScenarios(fork.getContext(side), this.options.belief ?? defaultBelief());
  }

  private async simulateWith(
    fork: BattleSession,
    side: 0 | 1,
    action: AgentAction,
    scenario: { moves: Pokemon['moves'] | null; action: AgentAction },
  ): Promise<number> {
    if (scenario.moves !== null) {
      const opponent = side === 0 ? fork.activeB : fork.activeA;
      opponent.moves = scenario.moves.map((move) => ({ ...move }));
    }
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
    return evaluateValue(fork.getContext(side));
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
