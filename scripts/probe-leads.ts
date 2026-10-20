import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';

for (const t of META_TEAMS) {
  const mons = teamToPokemons(t);
  const first = mons[0]!;
  const megaHolders = mons.filter((p) => p.item !== null && /ite(-z)?$/.test(p.item));
  console.log(
    `${t.name}\n  先頭: ${first.name}(${first.item ?? 'なし'}) / メガ石保持: ${megaHolders.map((p) => `${p.name}(${p.item})`).join(', ') || 'なし'}`,
  );
}
