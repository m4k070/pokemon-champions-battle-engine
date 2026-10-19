import { ABILITY_NAMES } from '../src/ability-names.js';

// gamewith「最強パーティランキング」（2026-10-19 取得）に載る12構築で使われるポケモンの特性が、
// すべてエンジンに登録されていることを固定する。未登録の特性名は実行時に弾かれるため、
// 構築をカタログに載せる前にここで気づけるようにする。
// 出典: gamewith.jp/pokemon-champions/555537 の12構築に登場するポケモン32種（PokeAPIで特性を確認）
const BUILD_ABILITIES = [
  'adaptability',
  'battle-switch',
  'blaze',
  'clear-body',
  'corrosion',
  'cursed-body',
  'cute-charm',
  'damp',
  'defiant',
  'disguise',
  'drizzle',
  'emergency-exit',
  'frisk',
  'good-as-gold',
  'harvest',
  'infiltrator',
  'inner-focus',
  'intimidate',
  'justified',
  'keen-eye',
  'klutz',
  'levitate',
  'light-metal',
  'lightning-rod',
  'limber',
  'liquid-voice',
  'magic-guard',
  'magician',
  'mirror-armor',
  'mold-breaker',
  'moxie',
  'multiscale',
  'opportunist',
  'overgrow',
  'poison-touch',
  'pressure',
  'protean',
  'psychic-surge',
  'rain-dish',
  'rough-skin',
  'sand-force',
  'sand-stream',
  'sand-veil',
  'seed-sower',
  'speed-boost',
  'stalwart',
  'stamina',
  'static',
  'steadfast',
  'sturdy',
  'supreme-overlord',
  'swift-swim',
  'synchronize',
  'torrent',
  'toxic-debris',
  'unaware',
  'unburden',
  'unnerve',
];

describe('構築で使われる特性のカバレッジ', () => {
  test('12構築で使われる特性がすべて ability-names.ts に登録されている', () => {
    const registered = new Set<string>(ABILITY_NAMES);
    const missing = BUILD_ABILITIES.filter((a) => !registered.has(a));
    expect(missing).toEqual([]);
  });

  test('登録済みの特性数は構築の特性数以上（取りこぼしの目安）', () => {
    expect(ABILITY_NAMES.length).toBeGreaterThanOrEqual(BUILD_ABILITIES.length);
  });
});
