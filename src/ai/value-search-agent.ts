import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { getLegalActions } from './battle-agent.js';
import type { BattleSession } from '../battle-runner.js';
import type { AgentAction } from '../types.js';
import { evaluateValue } from './value-function.js';
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
  //   'worst'   相手の合法手のうち自分にとって最悪の結果（maximin）
  opponentMode?: 'model' | 'uniform' | 'worst';
  // 探索する候補の上限（計算時間の制御）。0 なら全候補。
  maxCandidates?: number;
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
    return { action: bestAction, reasoning: `1手先読み: ${bestLabel} (勝率 ${(bestValue * 100).toFixed(1)}%)` };
  }

  private async evaluate(session: BattleSession, side: 0 | 1, action: AgentAction): Promise<number> {
    const mode = this.options.opponentMode ?? 'model';
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
    return mode === 'worst' ? worst : sum / opponentActions.length;
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
