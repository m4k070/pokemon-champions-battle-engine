
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent, damageRatio } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';
const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: any[], over: any = {}) => new Pokemon({ name: n, types: ['normal'], ability: 'none', baseStats: { ...stats, ...over }, moves: m });
const sub = createMove({ name: 'みがわり', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', createsSubstitute: true });
const weak = createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' });
const setup = createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });
const yawn = createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });
const strong = createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' });

const self = mon('自分', [sub, weak, setup]);
const soft = mon('変化技持ち', [yawn], { ATK: 60 });
const hard = mon('物理一本', [strong], { ATK: 180 });
console.log('yawn.inflictsDrowsy =', (yawn as any).inflictsDrowsy, 'status=', (yawn as any).status, 'category=', yawn.category);
console.log('damage ratio: soft vs self =', damageRatio(soft, self, yawn).toFixed(3), ' / hard vs self =', damageRatio(hard, self, strong).toFixed(3));
console.log('self best vs soft =', damageRatio(self, soft, weak).toFixed(3), ' vs hard =', damageRatio(self, hard, weak).toFixed(3));
const ctx = (o: any): any => ({ turn: 2, self, selfTeam: [self], opponent: o, opponentTeam: [o], canMegaEvolve: false, mustSwitch: false,
  field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false } }, recentLog: [] });
for (const o of [soft, hard]) {
  const agent = new HeuristicBattleAgent(new SeededRandom(1));
  await agent.selectAction(ctx(o));
  console.log(o.name, 'eval:', JSON.stringify(agent.lastEvaluation));
}
