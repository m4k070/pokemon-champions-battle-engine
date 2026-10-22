
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { SeededRandom } from '../src/rng.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';

const blaziken = new Pokemon({
  name: 'blaziken', types: ['fire', 'fighting'], ability: 'speed-boost', item: 'focus-sash',
  baseStats: { HP: 80, ATK: 120, DEF: 70, SPATK: 110, SPDEF: 70, SPEED: 80 },
  statPoints: { ATK: 32, SPEED: 32 }, nature: 'ようき',
  moves: [
    createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
    createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
    createMove({ name: 'フレアドライブ', type: 'fire', power: 120, accuracy: 100, pp: 15, category: 'physical', recoil: 1 / 3 }),
    createMove({ name: 'まもる', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', priority: 4, protects: true }),
  ],
});
const metagross = teamToPokemons(META_TEAMS.find((t) => t.name === 'カバルドン二軸デュアルメガ（M-7 試作PT v1）')!).find((p) => p.name === 'metagross')!;
const gyarados = teamToPokemons(META_TEAMS.find((t) => t.name === 'メガリザードンY構築')!).find((p) => p.name === 'gyarados')!;
const team = [blaziken, metagross, gyarados];
const other = META_TEAMS.find((t) => t.name === 'メガリザードンY構築')!;
const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
const agent = new ScriptedComboAgent(new SeededRandom(1), { passTo: 'metagross', targetBoost: 2, setupMoves: ['つるぎのまい'] });
const result = await runBattle(team, opp, agent, new HeuristicBattleAgent(new SeededRandom(2)), {
  maxTurns: 40, rng: new SeededRandom(9), information: 'partial', leadA: blaziken, leadB: opp[0],
});
console.log('winner', result.winner, 'turns', result.turns);
console.log(String(result.log).split('\n').filter((l) => /バトン|引き継|つるぎ|メガシンカ|戦闘不能|勝|負/.test(l)).join('\n'));
console.log('metagross stages:', JSON.stringify(metagross.statStages));
