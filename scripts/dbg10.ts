
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
for (const name of ['メガリザードンY構築', 'カバルカ構築', 'メガグソクムシャ構築']) {
  const e = META_TEAMS.find((t) => t.name === name)!;
  const picked = selectTeamWithPlan(e, teamToPokemons(e)).members;
  console.log(name, 'len=', picked.length, picked.map((p) => p?.name ?? 'undefined').join(','));
}
