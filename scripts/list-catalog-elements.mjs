// カタログの技・特性・持ち物の一覧を出す（フラグ設計用）。
import { readFileSync } from 'node:fs';

const teams = JSON.parse(readFileSync('data/gamewith-555537-2026-10-19.json', 'utf8'));
const cat = JSON.parse(readFileSync('data/pokeapi-catalog.json', 'utf8'));

const toFullWidth = (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
const moveNames = new Set();
const abilities = new Set();
const items = new Set();
for (const t of teams) for (const m of t.members) {
  m.moves.forEach((x) => moveNames.add(x));
  abilities.add(m.ability);
  items.add(m.item);
}

console.log('=== 技 (' + moveNames.size + ') ===');
for (const name of [...moveNames].sort()) {
  const d = cat.moves[name] ?? cat.moves[toFullWidth(name)];
  if (!d) { console.log(`?? ${name}`); continue; }
  const meta = d.meta ? ` ail=${d.meta.ailment?.name} cat=${d.meta.category?.name} drain=${d.meta.drain} heal=${d.meta.healing} statCh=${d.meta.stat_chance} crit=${d.meta.crit_rate} hits=${d.meta.min_hits}-${d.meta.max_hits} flinch=${d.meta.flinch_chance}` : '';
  const sc = d.statChanges.length ? ' sc=' + d.statChanges.map((s) => `${s.stat}${s.change > 0 ? '+' : ''}${s.change}`).join(',') : '';
  console.log(`${name} | ${d.apiName} | ${d.type}/${d.category} P=${d.power} A=${d.accuracy} PP=${d.pp} pri=${d.priority}${sc}${meta}`);
  console.log(`    ${d.effect}`);
}

console.log('\n=== 特性 (' + abilities.size + ') ===');
for (const a of [...abilities].sort()) console.log('  ' + a);
console.log('\n=== 持ち物 (' + items.size + ') ===');
for (const i of [...items].sort()) console.log('  ' + i);
