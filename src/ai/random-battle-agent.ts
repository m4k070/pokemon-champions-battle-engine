import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { getLegalActions } from './battle-agent.js';
import type { Pokemon } from '../pokemon.js';
import type { SeededRandom } from '../rng.js';

// 合法手から一様に選ぶだけの方策。学習ログの分布を広げるためと、
// 「相手が何をするか分からない」状況の基準として使う。
export class RandomBattleAgent implements BattleAgent {
  constructor(private readonly rng: SeededRandom) {}

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return team[0]!;
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const legal = getLegalActions(context);
    const moveChoices = legal.moves.map((move) => move.index);
    const switchChoices = legal.switches.map((target) => target.index);
    const total = moveChoices.length + switchChoices.length;
    if (total === 0) return { action: { type: 'forfeit' } };
    const pick = Math.min(total - 1, Math.floor(this.rng.next() * total));
    if (pick < moveChoices.length) {
      return { action: { type: 'move', moveIndex: moveChoices[pick]!, target: 0, megaEvolve: legal.canMegaEvolve || undefined } };
    }
    return { action: { type: 'switch', pokemonIndex: switchChoices[pick - moveChoices.length]! } };
  }
}
