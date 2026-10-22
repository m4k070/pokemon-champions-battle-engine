
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
for (const e of META_TEAMS) {
  const picked = selectTeamWithPlan(e, teamToPokemons(e)).members.map((p) => p.name);
  console.log(`\n=== ${e.name} (選出: ${picked.join('/')}) ===`);
  for (const p of teamToPokemons(e)) {
    const mark = picked.includes(p.name) ? '*' : ' ';
    console.log(`${mark}${p.name} [${p.types.join('/')}] ${p.ability} @${p.item ?? '-'} : ${p.moves.map((m) => m.name).join(', ')}`);
  }
}
