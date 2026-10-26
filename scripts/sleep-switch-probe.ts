
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: any[]) => new Pokemon({ name: n, types: ['normal'], ability: 'none', baseStats: stats, moves: m });

class Plan implements BattleAgent {
  constructor(private readonly steps: string[]) {}
  async selectLead(t: Pokemon[]) { return t[0]!; }
  async selectAction(ctx: BattleContext) {
    const step = this.steps[ctx.turn - 1] ?? 'idle';
    if (step === 'back') return { action: { type: 'switch' as const, pokemonIndex: 0 } };
    if (step === 'switch' || ctx.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    return { action: { type: 'move' as const, moveIndex: 1, target: 0 } };
  }
}

const moves = () => [
  createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
  createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
];

const a1 = mon('a1', moves());
const a2 = mon('a2', moves());
const b1 = mon('b1', moves());
const b2 = mon('b2', moves());
a1.applySleep(3);
console.log('開始時 a1 sleep turns =', JSON.stringify(a1.statusState));
const result = await runBattle([a1, a2], [b1, b2], new Plan(['switch', 'back']), new Plan(['idle', 'idle']), {
  maxTurns: 2, rng: new SeededRandom(3),
});
console.log(String(result.log));
console.log('終了時 a1 status =', a1.status, JSON.stringify(a1.statusState));
