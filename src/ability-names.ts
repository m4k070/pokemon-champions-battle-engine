// 特性名の単一の情報源。Pokemon.ability はこの列挙のいずれかを取る。
// 新しい特性を扱うときは、まずここに名前を追加する
// （挙動を実装する場合は src/rules/abilities/ にも AbilityDefinition を追加する）。
export const ABILITY_NAMES = [
  // --- 挙動が実装されている特性 ---
  // ABILITY_REGISTRY に AbilityDefinition があるか、エンジン・Pokemon が名前で直接分岐する。
  'adaptability',
  'aerilate',
  'battle-switch',
  'bulletproof',
  'contrary',
  'drizzle',
  'drought',
  'electric-surge',
  'huge-power',
  'inner-focus',
  'insomnia',
  'intimidate',
  'levitate',
  'lightning-rod',
  'magic-bounce',
  'magician',
  'mirror-armor',
  'mold-breaker',
  'multiscale',
  'no-guard',
  'parental-bond',
  'pixilate',
  'poison-point',
  'protean',
  'regenerator',
  'rough-skin',
  'sand-force',
  'sand-stream',
  'scrappy',
  'shadow-tag',
  'shell-armor',
  'snow-warning',
  'speed-boost',
  'spicy-spray',
  'stamina',
  'sturdy',
  'swift-swim',
  'synchronize',
  'technician',
  'thick-fat',
  'tough-claws',
  'unaware',
  'weak-armor',

  // --- 名前だけを持つ特性 ---
  // ポケモンのデータとしては現れるが、バトル中の分岐には影響しない。
  // 'none' は「特性なし」を表す。
  'beast-boost',
  'blaze',
  'chlorophyll',
  'infiltrator',
  'mega-launcher',
  'natural-cure',
  'none',
  'overgrow',
  'prankster',
  'run-away',
  'sand-rush',
  'serene-grace',
  'static',
  'torrent',
  'transistor',
  'wonder-guard',
] as const;

export type AbilityName = (typeof ABILITY_NAMES)[number];

const ABILITY_NAME_SET: ReadonlySet<string> = new Set(ABILITY_NAMES);

// 外部入力（MCPの技・ポケモン定義など）が既知の特性名かを検証する。
export function isAbilityName(value: string): value is AbilityName {
  return ABILITY_NAME_SET.has(value);
}
