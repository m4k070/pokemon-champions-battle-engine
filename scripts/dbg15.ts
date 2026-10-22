
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent, damageRatio } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';
const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (n: string, m: any[], over: any = {}) => new Pokemon({ name: n, types: ['normal'], ability: 'none', baseStats: { ...stats, ...over }, moves: m });
const passer = mon('パサー', [
  createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
  createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
  createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
]);
passer.statStages.ATK = 4;
const ace = mon('エース', [createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' })], { ATK: 150 });
const opponent = mon('カベ', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })], { HP: 200, DEF: 180 });
const ctx: any = { turn: 3, self: passer, selfTeam: [passer, ace], opponent, opponentTeam: [opponent], canMegaEvolve: false, mustSwitch: false,
  field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false } }, recentLog: [] };
const agent = new HeuristicBattleAgent(new SeededRandom(1));
const d = await agent.selectAction(ctx);
console.log('decision:', JSON.stringify(d));
console.log('inner evaluation:', JSON.stringify(agent.lastEvaluation));
console.log('ratios: passer quick attack', damageRatio(passer, opponent, passer.moves[2]!).toFixed(3), ' ace at +4', (() => { ace.statStages.ATK = 4; return damageRatio(ace, opponent, ace.moves[0]!).toFixed(3); })(), ' ace at 0', (() => { ace.statStages.ATK = 0; return damageRatio(ace, opponent, ace.moves[0]!).toFixed(3); })());
