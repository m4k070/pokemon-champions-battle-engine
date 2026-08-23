// 持ち物名の単一の情報源。Pokemon.item はこの列挙のいずれか、または null を取る。
// 新しい持ち物を扱うときは、まずここに名前を追加する。
export const ITEM_NAMES = [
  // --- 挙動が実装されている持ち物 ---
  // エンジンが名前で直接分岐する。
  'chesto-berry',
  'choice-band',
  'choice-scarf',
  'choice-specs',
  'focus-sash',
  'iron-ball',
  'leftovers',
  'life-orb',
  'lum-berry',
  'mental-herb',
  'shed-shell',
  'shuca-berry',
  'sitrus-berry',
  'toxic-orb',
  'white-herb',
  'x-speed',

  // --- メガストーン ---
  // 対象ポケモンと種族値の対応は MEGA_STONE_SEEDS（rules/mega-evolution.ts）が持つ。
  'blastoisinite',
  'blazikenite',
  'charizardite-x',
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

  // --- 名前だけを持つ持ち物 ---
  // ポケモンのデータとしては現れるが、バトル中の分岐には影響しない。
  'rocky-helmet',
] as const;

export type ItemName = (typeof ITEM_NAMES)[number];

const ITEM_NAME_SET: ReadonlySet<string> = new Set(ITEM_NAMES);

// 外部入力（MCPのポケモン定義など）が既知の持ち物名かを検証する。
export function isItemName(value: string): value is ItemName {
  return ITEM_NAME_SET.has(value);
}
