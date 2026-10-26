// 持ち物名の単一の情報源。Pokemon.item はこの列挙のいずれか、または null を取る。
// 新しい持ち物を扱うときは、まずここに名前を追加する。
export const ITEM_NAMES = [
  // --- 挙動が実装されている持ち物 ---
  // エンジンが名前で直接分岐する。
  'air-balloon',
  'black-glasses',
  'chesto-berry',
  'choice-band',
  'choice-scarf',
  'choice-specs',
  'focus-sash',
  'dragon-fang',
  'iron-ball',
  'leftovers',
  'life-orb',
  'light-clay',
  'lum-berry',
  'mental-herb',
  'mystic-water',
  'shed-shell',
  'shuca-berry',
  'sitrus-berry',
  'spell-tag',
  'terrain-extender',
  'toxic-orb',
  'white-herb',
  'x-speed',

  // --- メガストーン ---
  // 対象ポケモンと種族値の対応は MEGA_STONE_SEEDS（rules/mega-evolution.ts）が持つ。
  'blastoisinite',
  'blazikenite',
  'banettite',
  'charizardite-x',
  'garchompite-z',
  'floettite',
  'golisopodite',
  'lucarionite-z',
  'clefablite',
  'absolite-z',
  'froslassite',
  'staraptite',
  'charizardite-y',
  'delphoxite',
  'dragoniteite',
  'garchompite',
  'gardevoirite',
  'gengarite',
  'greninjaite',
  'gyaradosite',
  'kangaskhanite',
  'lopunnite',
  'lucarionite',
  'mawilite',
  'metagrossite',
  'raichunite-x',
  'raichunite-y',
  'sablenite',
  'salamencite',
  'scizorite',
  'scolipite',
  'scovillainite',
  'swampertite',
  'venusaurite',
  'victreebelite',

  // --- 名前だけを持つ持ち物 ---
  // ポケモンのデータとしては現れるが、バトル中の分岐には影響しない。
  // gamewith 最強パーティランキング（2026-10-19）の構築に登場するものもここに含む。
  'damp-rock',
  'grassy-seed',
  'haban-berry',
  'psychic-seed',
  'red-card',
  'rocky-helmet',
] as const;

export type ItemName = (typeof ITEM_NAMES)[number];

const ITEM_NAME_SET: ReadonlySet<string> = new Set(ITEM_NAMES);

// 外部入力（MCPのポケモン定義など）が既知の持ち物名かを検証する。
export function isItemName(value: string): value is ItemName {
  return ITEM_NAME_SET.has(value);
}
