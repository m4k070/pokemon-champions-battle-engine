
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
    if (step === 'switch' || ctx.mustSwitch) return { action: { type: 'switch' as const, pokemonIndex: 1 } };
    const idx = step === 'sub' ? 0 : step === 'yawn' ? 1 : step === 'twave' ? 2 : 3;
    return { action: { type: 'move' as const, moveIndex: idx, target: 0 } };
  }
}

const moves = () => [
  createMove({ name: 'みがわり', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', createsSubstitute: true }),
  createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
  createMove({ name: 'でんじは', type: 'electric', power: 0, accuracy: 90, pp: 20, category: 'status', status: 'paralysis' }),
  createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
];

const a = mon('A', moves());
const b = mon('B', moves());
const result = await runBattle([a], [b], new Plan(['sub', 'idle']), new Plan(['yawn', 'twave']), {
  maxTurns: 2, rng: new SeededRandom(3),
});
console.log(String(result.log));
console.log('A: substituteHP=', a.substituteHP, ' status=', a.status, ' drowsy=', a.isDrowsy);
