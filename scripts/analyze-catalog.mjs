// 取得したデータの突き合わせ（実数値の検算・未解決の技・フォルム差分）。
// 使い方: node scripts/analyze-catalog.mjs
import { readFileSync } from 'node:fs';

const teams = JSON.parse(readFileSync('data/gamewith-555537-2026-10-19.json', 'utf8'));
const cat = JSON.parse(readFileSync('data/pokeapi-catalog.json', 'utf8'));

const NATURES = {
  いじっぱり: { up: 'ATK', down: 'SPATK' },
  ゆうかん: { up: 'ATK', down: 'SPEED' },
  やんちゃ: { up: 'ATK', down: 'SPDEF' },
  さみしがり: { up: 'ATK', down: 'DEF' },
  ずぶとい: { up: 'DEF', down: 'ATK' },
  わんぱく: { up: 'DEF', down: 'SPATK' },
  のうてんき: { up: 'DEF', down: 'SPDEF' },
  のんき: { up: 'DEF', down: 'SPEED' },
  ひかえめ: { up: 'SPATK', down: 'ATK' },
  おっとり: { up: 'SPATK', down: 'DEF' },
  うっかりや: { up: 'SPATK', down: 'SPDEF' },
  れいせい: { up: 'SPATK', down: 'SPEED' },
  おだやか: { up: 'SPDEF', down: 'ATK' },
  おとなしい: { up: 'SPDEF', down: 'DEF' },
  しんちょう: { up: 'SPDEF', down: 'SPATK' },
  なまいき: { up: 'SPDEF', down: 'SPEED' },
  おくびょう: { up: 'SPEED', down: 'ATK' },
  せっかち: { up: 'SPEED', down: 'DEF' },
  ようき: { up: 'SPEED', down: 'SPATK' },
  むじゃき: { up: 'SPEED', down: 'SPDEF' },
};
const ORDER = ['HP', 'ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];

function calc(base, points, nature) {
  const n = NATURES[nature] ?? null;
  const st = {};
  st.HP = Math.floor(((base.HP * 2 + 31) * 50) / 100) + 50 + 10 + points.HP;
  for (const k of ORDER.slice(1)) {
    const raw = Math.floor(((base[k] * 2 + 31) * 50) / 100) + 5 + points[k];
    let m = 1;
    if (n && n.up === k) m = 1.1;
    if (n && n.down === k) m = 0.9;
    st[k] = Math.floor(raw * m);
  }
  return st;
}

const missingMoves = new Set();
const missingPokemon = new Set();
let checks = 0;
const problems = [];

for (const team of teams) {
  for (const m of team.members) {
    const p = cat.pokemon[m.name];
    if (!p) { missingPokemon.add(m.name); continue; }
    const gwBase = m.baseStats.split('-').map(Number);
    const apiBase = ORDER.map((k) => p.baseStats[k]);
    if (gwBase.join(',') !== apiBase.join(',')) {
      problems.push(`種族値ずれ ${m.name}: gamewith=${gwBase.join('-')} pokeapi=${apiBase.join('-')}`);
    }
    const pts = m.ev.split(',').map(Number);
    const sum = pts.reduce((a, b) => a + b, 0);
    if (sum > 66) problems.push(`ポイント超過 ${team.name}/${m.name}: ${sum}`);
    const points = Object.fromEntries(ORDER.map((k, i) => [k, pts[i]]));
    const got = calc(p.baseStats, points, m.nature);
    const want = m.stat.split(',').map(Number);
    checks++;
    const gotArr = ORDER.map((k) => got[k]);
    if (gotArr.join(',') !== want.join(',')) {
      problems.push(`実数値ずれ ${team.name}/${m.name} ${m.nature} ${m.ev}: calc=${gotArr.join(',')} page=${want.join(',')} (base=${apiBase.join('-')})`);
    }
    for (const mv of m.moves) if (!cat.moves[mv]) missingMoves.add(`${mv} (${m.name})`);
    if (m.form1Name) {
      const f = m.form1BaseStats.split('-').map(Number);
      const delta = f.map((v, i) => v - gwBase[i]);
      const sumD = delta.slice(1).reduce((a, b) => a + b, 0);
      console.log(`MEGA ${m.form1Name}: base=${m.form1BaseStats} types=${m.form1Type1}/${m.form1Type2} ability=${m.form1Ability} delta=${delta.join(',')} sum=${sumD}`);
    }
  }
}

console.log(`\n実数値照合: ${checks} 体`);
console.log(`ポケモン未取得: ${[...missingPokemon].join(', ') || 'なし'}`);
console.log(`技未取得 (${missingMoves.size}):`);
for (const m of [...missingMoves].sort()) console.log('  ' + m);
console.log(`\n差分・問題 (${problems.length}):`);
for (const p of problems) console.log('  ' + p);
