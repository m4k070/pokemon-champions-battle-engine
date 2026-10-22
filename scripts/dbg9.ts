
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import { SeededRandom } from '../src/rng.js';

const blaziken = new Pokemon({
  name: 'blaziken', types: ['fire', 'fighting'], ability: 'speed-boost', item: 'focus-sash',
  baseStats: { HP: 80, ATK: 120, DEF: 70, SPATK: 110, SPDEF: 70, SPEED: 80 },
  moves: [
    createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
    createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
    createMove({ name: 'フレアドライブ', type: 'fire', power: 120, accuracy: 100, pp: 15, category: 'physical' }),
  ],
});
console.log('moves:', blaziken.moves.map((m) => `${m.name} pivot=${(m as any).pivot} pass=${(m as any).passStats}`).join(' | '));
const meta = new Pokemon({ name: 'metagross', types: ['steel','psychic'], ability: 'clear-body', baseStats: { HP: 80, ATK: 135, DEF: 130, SPATK: 95, SPDEF: 90, SPEED: 70 }, moves: [createMove({ name: 'サイコファング', type: 'psychic', power: 85, accuracy: 100, pp: 10, category: 'physical' })] });
const opp = new Pokemon({ name: 'x', types: ['ground'], ability: 'none', baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 }, moves: [createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' })] });
blaziken.statStages.ATK = 2;
const ctx: any = { turn: 2, self: blaziken, selfTeam: [blaziken, meta], opponent: opp, opponentTeam: [opp], canMegaEvolve: false, mustSwitch: false,
  field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false } }, recentLog: [] };
const agent = new ScriptedComboAgent(new SeededRandom(1), { passTo: 'metagross', targetBoost: 2, setupMoves: ['つるぎのまい'] });
console.log('decision:', JSON.stringify(await agent.selectAction(ctx)));
