import type { BattleAgent, BattleContext, AgentDecision } from '../battle-agent.js';
import { getLegalActions } from '../battle-agent.js';
import { HeuristicV1BattleAgent } from '../baselines/heuristic-v1.js';
import { ValueSearchBattleAgent } from '../value-search-agent.js';
import { RandomBattleAgent } from '../random-battle-agent.js';
import type { Pokemon } from '../../pokemon.js';
import { SeededRandom } from '../../rng.js';

// 評価プール。強さは単一の相手への勝率ではなく、性格の違う相手との総当たりで測る。
// 凍結ベースラインだけを相手にすると「その相手への最適応答度」しか分からない。

// 一定確率でランダムな合法手を打つ。ベースラインの摂動版（搾取されやすさの基準）。
class EpsilonRandomAgent implements BattleAgent {
  constructor(
    private readonly inner: BattleAgent,
    private readonly rng: SeededRandom,
    private readonly epsilon: number,
  ) {}

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    if (this.rng.next() >= this.epsilon) return this.inner.selectAction(context);
    const legal = getLegalActions(context);
    const total = legal.moves.length + legal.switches.length;
    if (total === 0) return { action: { type: 'forfeit' } };
    const pick = Math.min(total - 1, Math.floor(this.rng.next() * total));
    if (pick < legal.moves.length) return { action: { type: 'move', moveIndex: legal.moves[pick].index, target: 0 } };
    return { action: { type: 'switch', pokemonIndex: legal.switches[pick - legal.moves.length].index } };
  }
}

// 相手方策の手を読む1手先読み。「相手を知っている」前提なので、強さではなく
// 搾取されにくさ（exploitability）を測る道具として使う。
class ModelReadingAgent implements BattleAgent {
  constructor(private readonly inner: ValueSearchBattleAgent) {}

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    return this.inner.selectAction(context);
  }
}

export type PoolAgentName =
  | 'baseline'      // 凍結ベースラインv1
  | 'baseline-eps'  // ベースラインに10%のランダムを混ぜた摂動版
  | 'random'        // 合法手から一様
  | 'value'         // 1手先読み（信念・margin 0.05）
  | 'value-maximin' // 1手先読み（相手の最悪ケース）
  | 'exploiter';    // 現行方策を読む1手先読み（搾取側）

export function createPoolAgent(name: PoolAgentName, seed: number): BattleAgent {
  const rng = new SeededRandom(seed);
  switch (name) {
    case 'baseline':
      return new HeuristicV1BattleAgent(new SeededRandom(seed));
    case 'baseline-eps':
      return new EpsilonRandomAgent(new HeuristicV1BattleAgent(new SeededRandom(seed)), rng, 0.1);
    case 'random':
      return new RandomBattleAgent(rng);
    case 'value':
      return new ValueSearchBattleAgent(new SeededRandom(seed), { opponentMode: 'belief', trustMargin: 0.05 });
    case 'value-maximin':
      return new ValueSearchBattleAgent(new SeededRandom(seed), { opponentMode: 'worst', trustMargin: 0.05 });
    case 'exploiter': {
      // 現行方策を相手モデルとして与える（内側は信念モードで軽く回す）。
      const target = new ValueSearchBattleAgent(new SeededRandom(seed + 1000), {
        opponentMode: 'belief',
        trustMargin: 0.05,
      });
      return new ModelReadingAgent(
        new ValueSearchBattleAgent(new SeededRandom(seed), { opponentMode: 'model', opponentModel: target }),
      );
    }
    default:
      throw new Error(`未知のエージェント: ${String(name)}`);
  }
}

export const POOL: PoolAgentName[] = ['baseline', 'baseline-eps', 'random', 'value', 'value-maximin', 'exploiter'];
