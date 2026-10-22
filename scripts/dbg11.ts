
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

const e = META_TEAMS.find((t) => t.name === 'クエスピクシー構築')!;
const team = selectTeamWithPlan(e, teamToPokemons(e)).members;
const other = META_TEAMS.find((t) => t.name === 'カバルカ構築')!;
for (let i = 0; i < 3; i++) {
  const opp = selectTeamWithPlan(other, teamToPokemons(other)).members;
  const before = team.map((p) => p.currentHP).join(',');
  const r = await runBattle(team, opp, new HeuristicBattleAgent(new SeededRandom(1)), new HeuristicBattleAgent(new SeededRandom(2)), {
    maxTurns: 40, rng: new SeededRandom(9), information: 'partial', leadA: team[0], leadB: opp[0],
  });
  const after = team.map((p) => p.currentHP).join(',');
  console.log(`game${i}: winner=${r.winner} turns=${r.turns} before=[${before}] after=[${after}]`);
}
