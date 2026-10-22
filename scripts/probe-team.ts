import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
const name = process.argv[2] ?? 'クエスピクシー構築';
const e = META_TEAMS.find((t) => t.name === name)!;
for (const p of selectTeamWithPlan(e, teamToPokemons(e)).members) {
  console.log(`${p.name} | ${p.ability} | ${p.moves.map((m) => `${m.name}(${m.category})`).join(', ')}`);
}
