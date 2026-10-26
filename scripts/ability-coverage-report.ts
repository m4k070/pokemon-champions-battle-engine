// カタログの特性が「実装あり」か「名前だけ登録」かを一覧化する（docs の棚卸し用）。
// 使い方: npx tsx scripts/ability-coverage-report.ts
import { readFileSync } from 'node:fs';
import { GAMEWITH_TEAMS } from '../src/data/meta-teams-catalog.js';
import { ABILITY_REGISTRY } from '../src/rules/abilities/registry.js';
import type { AbilityName } from '../src/ability-names.js';

// AbilityDefinition を持たず、エンジン本体（battle-engine / pokemon / mega-evolution）が
// 特性名で直接分岐しているもの。src を grep して洗い出した（2026-10-19）。
const ENGINE_DIRECT: ReadonlySet<string> = new Set([
  'adaptability',
  'aerilate',
  'contrary',
  'levitate',
  'lightning-rod',
  'magic-bounce',
  'mirror-armor',
  'mold-breaker',
  'parental-bond',
  'pixilate',
  'swift-swim',
]);

const jaToEn: Record<string, string> = JSON.parse(readFileSync('data/catalog-ability-map.json', 'utf8'));
const enToJa = Object.fromEntries(Object.entries(jaToEn).map(([ja, en]) => [en, ja]));

const usage = new Map<string, { teams: Set<string>; slots: number }>();
for (const team of GAMEWITH_TEAMS) {
  for (const member of team.members) {
    const entry = usage.get(member.ability) ?? { teams: new Set<string>(), slots: 0 };
    entry.teams.add(team.name);
    entry.slots += 1;
    usage.set(member.ability, entry);
  }
}

const rows = [...usage.entries()]
  .map(([ability, u]) => ({
    ability: ability as AbilityName,
    ja: enToJa[ability] ?? ability,
    implemented: ABILITY_REGISTRY[ability as AbilityName] !== undefined || ENGINE_DIRECT.has(ability),
    teams: u.teams.size,
    slots: u.slots,
  }))
  .sort((a, b) => Number(b.implemented) - Number(a.implemented) || b.slots - a.slots || a.ja.localeCompare(b.ja, 'ja'));

const implemented = rows.filter((r) => r.implemented);
const nameOnly = rows.filter((r) => !r.implemented);

console.log(`特性 ${rows.length} 種 / 実装あり ${implemented.length} / 名前だけ ${nameOnly.length}`);
console.log('\n| 特性 | ID | 状態 | 構築数 | 枠 |');
console.log('|---|---|---|---|---|');
for (const r of [...implemented, ...nameOnly]) {
  console.log(`| ${r.ja} | \`${r.ability}\` | ${r.implemented ? '実装あり' : '名前だけ'} | ${r.teams} | ${r.slots} |`);
}
