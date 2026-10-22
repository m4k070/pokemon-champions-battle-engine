import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: any[]) => new Pokemon({ name: n, types: ['normal'], ability: 'none', baseStats: stats, moves: m });
const a = mon('ピクシー', [
  createMove({ name: 'めいそう', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'SPATK', delta: 1 }] }),
  createMove({ name: 'アシストパワー', type: 'normal', power: 20, accuracy: 100, pp: 10, category: 'special', storedPower: true }),
]);
const o = mon('あいて', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);
const s = await BattleSession.start([a], [o], { rng: new SeededRandom(2) });
const A = (i: number): BattleAgent => ({
  async selectLead(t: Pokemon[]) { return t[0]!; },
  async selectAction() { return { action: { type: 'move' as const, moveIndex: i, target: 0 } }; },
});
await s.playTurn(A(0), A(0));
await s.playTurn(A(0), A(0));
console.log('stages before:', JSON.stringify(a.statStages));
await s.playTurn(A(1), A(0));
console.log(String(s.log).split('\n').slice(-12).join('\n'));
