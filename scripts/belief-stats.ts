
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
const belief = new Map<string, number>();
for (const e of META_TEAMS) for (const p of teamToPokemons(e)) {
  const sig = p.moves.map((m) => m.name).sort().join(',') + '|' + p.item + '|' + p.ability;
  const set = belief.get(p.name) ?? 0;
  belief.set(p.name, set);
}
const sigs = new Map<string, Set<string>>();
for (const e of META_TEAMS) for (const p of teamToPokemons(e)) {
  const sig = p.moves.map((m) => m.name).sort().join(',') + '|' + p.item + '|' + p.ability;
  const s = sigs.get(p.name) ?? new Set();
  s.add(sig); sigs.set(p.name, s);
}
let multi = 0, single = 0;
for (const [, s] of sigs) { if (s.size > 1) multi++; else single++; }
console.log('種族数', sigs.size, '/ 候補セットが2種類以上', multi, '/ 1種類のみ', single);
for (const [name, s] of sigs) if (s.size > 1) console.log(' ', name, s.size);
