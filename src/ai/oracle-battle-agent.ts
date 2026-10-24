import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { HeuristicBattleAgent } from './heuristic-battle-agent.js';
import { Pokemon } from '../pokemon.js';
import { SeededRandom } from '../rng.js';

// 統制実験用: 相手の伏せ情報を「真の値」で埋める（千里眼）。
// PIMC のサンプリングと分離して「情報量そのものが勝率を変えるか」を測る。
export class OracleBattleAgent implements BattleAgent {
  constructor(
    private readonly truth: Pokemon[],
    seed = 1,
  ) {
    this.inner = new HeuristicBattleAgent(new SeededRandom(seed));
  }

  private readonly inner: HeuristicBattleAgent;

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const find = (candidate: Pokemon): Pokemon =>
      this.truth.find((pokemon) => pokemon.name === candidate.name) ?? candidate;
    const world: BattleContext = {
      ...context,
      opponent: find(context.opponent),
      opponentTeam: context.opponentTeam.map(find),
    };
    return this.inner.selectAction(world);
  }
}
