// このファイルは scripts/generate-meta-teams-catalog.mjs が生成する。手で編集しない。
//
// 出典:
//   構築（6体・持ち物・特性・性格・能力ポイント・技・選出）:
//     gamewith.jp/pokemon-champions/555537「最強パーティランキング」（2026-10-19 取得）
//     抽出データ: data/gamewith-555537-2026-10-19.json
//   種族値・タイプ・技の基礎データ（タイプ/威力/命中/PP/分類/優先度/追加効果）:
//     PokeAPI（2026-10-19 取得）data/pokeapi-catalog.json
//
// 実数値の検算: 全66体について、ページ記載の実数値とエンジンの計算式
// （StatPointSystem: 1ポイント=実数値1・合計66/各32上限）が一致することを確認済み。
// 例外: メガラグラージ構築のラグラージはページのぼうぎょが113、計算値は112（ページ側の記載ずれ）。
import type { MetaTeamEntry } from './meta-teams.js';
import { createMove } from '../move.js';

export const GAMEWITH_TEAMS: MetaTeamEntry[] = [
  {
    name: 'メガガブリアスZ構築',
    source: 'gamewith.jp/pokemon-champions/555537（最強パーティランキング・2026-10-19 取得）',
    basicSelection: '基本選出: カバルドン（初手）／サーフゴー など／メガガブリアスZ',
    alternativeSelections: [
      '対面選出: アシレーヌ（初手）／ミミッキュ／メガメタグロス など',
    ],
    members: [
      {
        name: 'garchomp',
        displayName: 'ガブリアス',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'garchompite-z',
        nature: 'おくびょう',
        statPoints: { HP: 2, SPATK: 32, SPEED: 32 },
        moves: [
          createMove({ name: 'りゅうせいぐん', type: 'dragon', power: 130, accuracy: 90, pp: 5, category: 'special', selfStatChange: [{ stat: 'SPATK', delta: -2 }] }),
          createMove({ name: 'かえんほうしゃ', type: 'fire', power: 90, accuracy: 100, pp: 15, category: 'special', secondaryEffect: { status: 'burn', chance: 10 } }),
          createMove({ name: 'どくづき', type: 'poison', power: 80, accuracy: 100, pp: 20, category: 'physical', secondaryEffect: { status: 'poison', chance: 30 } }),
          createMove({ name: 'ステルスロック', type: 'rock', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: "stealth-rock" }),
        ],
      },
      {
        name: 'metagross',
        displayName: 'メタグロス',
        baseStats: { HP: 80, ATK: 135, DEF: 130, SPATK: 95, SPDEF: 90, SPEED: 70 },
        types: ['steel', 'psychic'],
        ability: 'clear-body',
        item: 'metagrossite',
        nature: 'ようき',
        statPoints: { HP: 18, DEF: 20, SPEED: 28 },
        moves: [
          createMove({ name: 'サイコファング', type: 'psychic', power: 85, accuracy: 100, pp: 10, category: 'physical' }),
          createMove({ name: 'れいとうパンチ', type: 'ice', power: 75, accuracy: 100, pp: 15, category: 'physical', secondaryEffect: { status: 'freeze', chance: 10 } }),
          createMove({ name: 'ボディプレス', type: 'fighting', power: 80, accuracy: 100, pp: 10, category: 'physical', usesDefenseForAttack: true }),
          createMove({ name: 'てっぺき', type: 'steel', power: 0, accuracy: 100, pp: 15, category: 'status', selfStatChange: [{ stat: 'DEF', delta: 2 }] }),
        ],
      },
      {
        name: 'primarina',
        displayName: 'アシレーヌ',
        baseStats: { HP: 80, ATK: 74, DEF: 74, SPATK: 126, SPDEF: 116, SPEED: 60 },
        types: ['water', 'fairy'],
        ability: 'torrent',
        item: 'focus-sash',
        nature: 'うっかりや',
        statPoints: { ATK: 2, SPATK: 32, SPEED: 32 },
        moves: [
          createMove({ name: 'なみのり', type: 'water', power: 90, accuracy: 100, pp: 15, category: 'special' }),
          createMove({ name: 'ムーンフォース', type: 'fairy', power: 95, accuracy: 100, pp: 15, category: 'special', targetStatChange: [{ stat: 'SPATK', delta: -1, chance: 30 }] }),
          createMove({ name: 'エナジーボール', type: 'grass', power: 90, accuracy: 100, pp: 10, category: 'special', targetStatChange: [{ stat: 'SPDEF', delta: -1, chance: 10 }] }),
          createMove({ name: 'アクアジェット', type: 'water', power: 40, accuracy: 100, pp: 20, category: 'physical', priority: 1 }),
        ],
      },
      {
        name: 'mimikyu-disguised',
        displayName: 'ミミッキュ',
        baseStats: { HP: 55, ATK: 90, DEF: 80, SPATK: 50, SPDEF: 105, SPEED: 96 },
        types: ['ghost', 'fairy'],
        ability: 'disguise',
        item: 'life-orb',
        nature: 'いじっぱり',
        statPoints: { HP: 1, ATK: 32, DEF: 1, SPEED: 32 },
        moves: [
          createMove({ name: 'じゃれつく', type: 'fairy', power: 90, accuracy: 90, pp: 10, category: 'physical', targetStatChange: [{ stat: 'ATK', delta: -1, chance: 10 }] }),
          createMove({ name: 'シャドークロー', type: 'ghost', power: 70, accuracy: 100, pp: 15, category: 'physical' }),
          createMove({ name: 'かげうち', type: 'ghost', power: 40, accuracy: 100, pp: 30, category: 'physical', priority: 1 }),
          createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
        ],
      },
      {
        name: 'gholdengo',
        displayName: 'サーフゴー',
        baseStats: { HP: 87, ATK: 60, DEF: 95, SPATK: 133, SPDEF: 91, SPEED: 84 },
        types: ['steel', 'ghost'],
        ability: 'good-as-gold',
        item: 'leftovers',
        nature: 'おだやか',
        statPoints: { HP: 31, SPDEF: 24, SPEED: 11 },
        moves: [
          createMove({ name: 'ゴールドラッシュ', type: 'steel', power: 120, accuracy: 100, pp: 5, category: 'special', targetStatChange: [{ stat: 'SPATK', delta: -1, chance: 100 }] }),
          createMove({ name: 'シャドーボール', type: 'ghost', power: 80, accuracy: 100, pp: 15, category: 'special', targetStatChange: [{ stat: 'SPDEF', delta: -1, chance: 20 }] }),
          createMove({ name: 'わるだくみ', type: 'dark', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'SPATK', delta: 2 }] }),
          createMove({ name: 'じこさいせい', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', selfHealPercent: 0.5 }),
        ],
      },
      {
        name: 'hippowdon',
        displayName: 'カバルドン',
        baseStats: { HP: 108, ATK: 112, DEF: 118, SPATK: 68, SPDEF: 72, SPEED: 47 },
        types: ['ground'],
        ability: 'sand-stream',
        item: 'rocky-helmet',
        nature: 'わんぱく',
        statPoints: { HP: 32, DEF: 15, SPDEF: 19 },
        moves: [
          createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
          createMove({ name: 'こおりのキバ', type: 'ice', power: 65, accuracy: 95, pp: 15, category: 'physical', secondaryEffect: { status: 'freeze', chance: 10 } }),
          createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
          createMove({ name: 'なまける', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', selfHealPercent: 0.5 }),
        ],
      },
    ],
  },
];
