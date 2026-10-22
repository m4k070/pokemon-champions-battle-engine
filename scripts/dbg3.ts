import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

const entry = META_TEAMS.find((t) => t.name === 'クエスピクシー構築')!;
const other = META_TEAMS.find((t) => t.name === 'カバルカ構築')!;
const team = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
console.log('team:', team.map((p) => `${p.name}[${p.moves.map((m) => m.name).join('/')}]`).join(' '));
const result = await runBattle(team, opp, new ScriptedComboAgent(new SeededRandom(1)), new HeuristicBattleAgent(new SeededRandom(2)), {
  maxTurns: 30, rng: new SeededRandom(9), information: 'partial', leadA: team[0], leadB: opp[0],
});
console.log('winner', result.winner, 'turns', result.turns);
console.log(String(result.log).split('\n').slice(0, 45).join('\n'));
