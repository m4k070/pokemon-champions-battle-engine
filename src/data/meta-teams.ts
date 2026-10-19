import type { BaseStats, MoveData, TypeName } from '../types.js';
import type { NatureInput, StatPointsInput } from '../rules/stat-point-system.js';
import type { AbilityName } from '../ability-names.js';
import type { ItemName } from '../item-names.js';
import { createMove } from '../move.js';
import { Pokemon } from '../pokemon.js';

// 現環境PTカタログ。上位構築をエンジンに投入して「1試合を最後まで走らせる」ためのデータ。
//
// 数値の出典:
//   - 種族値・タイプ: PokeAPI（2026-10-19 取得）
//   - 技のタイプ・威力・分類: PokeAPI（マジカルフレイムのみ yakkun.com/ch/zukan/search/?move=572）
//   - 構築（6体・持ち物・性格・能力ポイント・技）: 下記 source のとおり
export interface MetaTeamMember {
  // エンジンが使う名前（PokeAPI の英語名）。メガシンカの照合は baseName と一致する必要がある。
  name: string;
  // 表示用の日本語名。
  displayName: string;
  baseStats: BaseStats;
  types: TypeName[];
  ability: AbilityName;
  item: ItemName | null;
  nature: NatureInput;
  statPoints: StatPointsInput;
  moves: MoveData[];
}

export interface MetaTeamEntry {
  name: string;
  source: string;
  members: MetaTeamMember[];
  // 基本選出（構築が固定選出を持たない場合は「相手次第」の既定を1つ置く）。
  basicSelection: string;
  // 代替選出。
  alternativeSelections: string[];
}

// カタログの1体を実際の Pokemon にする（能力ポイントと性格補正を反映する）。
export function toPokemon(member: MetaTeamMember): Pokemon {
  return new Pokemon({
    name: member.name,
    baseName: member.name,
    types: [...member.types],
    ability: member.ability,
    item: member.item,
    baseStats: { ...member.baseStats },
    statPoints: { ...member.statPoints },
    nature: member.nature,
    moves: member.moves,
  });
}

// カタログの1構築を6体の Pokemon にする。
export function teamToPokemons(entry: MetaTeamEntry): Pokemon[] {
  return entry.members.map(toPokemon);
}

export const META_TEAMS: MetaTeamEntry[] = [
  {
    name: 'カバルドン二軸デュアルメガ（M-7 試作PT v1）',
    source: '~/llm-wiki/wiki/pokemon-champions/試作PT_カバルドン二軸デュアルメガ.md（2026-10-18）',
    basicSelection: 'A サイクル: カバルドン／アシレーヌ／メガメタグロス',
    alternativeSelections: [
      'B 対面・特殊Z: カバルドン／イエッサン／メガガブリアスZ',
      'C 積み・フィールド: ハッサム／イエッサン／メガメタグロス',
      'D 対雨・対水: カバルドン／アシレーヌ／メガメタグロス（メガZは出さない）',
      'E 対鋼・対ゴースト: カバルドン／ハッサム／アシレーヌ（メガは相手次第）',
    ],
    members: [
  {
    name: 'hippowdon',
    displayName: 'カバルドン',
    baseStats: { HP: 108, ATK: 112, DEF: 118, SPATK: 68, SPDEF: 72, SPEED: 47 },
    types: ['ground'],
    ability: 'sand-stream',
    item: 'leftovers',
    nature: 'わんぱく',
    statPoints: { HP: 32, DEF: 32, SPDEF: 2 },
    moves: [
      createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
      createMove({ name: 'ステルスロック', type: 'rock', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: 'stealth-rock' }),
      createMove({ name: 'なまける', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', selfHealPercent: 0.5 }),
    ],
  },
  {
    name: 'garchomp',
    displayName: 'ガブリアス',
    baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    types: ['dragon', 'ground'],
    ability: 'rough-skin',
    item: 'garchompite-z',
    nature: 'おくびょう',
    statPoints: { SPATK: 32, SPEED: 32, HP: 2 },
    moves: [
      createMove({ name: 'りゅうせいぐん', type: 'dragon', power: 130, accuracy: 90, pp: 5, category: 'special' }),
      createMove({ name: 'かえんほうしゃ', type: 'fire', power: 90, accuracy: 100, pp: 15, category: 'special' }),
      createMove({ name: 'だいちのちから', type: 'ground', power: 90, accuracy: 100, pp: 10, category: 'special' }),
      createMove({ name: 'ドラゴンテール', type: 'dragon', power: 60, accuracy: 90, pp: 10, category: 'physical' }),
    ],
  },
  {
    name: 'metagross',
    displayName: 'メタグロス',
    baseStats: { HP: 80, ATK: 135, DEF: 130, SPATK: 95, SPDEF: 90, SPEED: 70 },
    types: ['steel', 'psychic'],
    ability: 'clear-body',
    item: 'metagrossite',
    nature: 'わんぱく',
    statPoints: { HP: 32, DEF: 32, ATK: 2 },
    moves: [
      createMove({ name: 'てっぺき', type: 'steel', power: 0, accuracy: 100, pp: 15, category: 'status', selfStatChange: [{ stat: 'DEF', delta: 2 }] }),
      createMove({ name: 'ボディプレス', type: 'fighting', power: 80, accuracy: 100, pp: 10, category: 'physical', usesDefenseForAttack: true }),
      createMove({ name: 'バレットパンチ', type: 'steel', power: 40, accuracy: 100, pp: 30, category: 'physical' }),
      createMove({ name: 'サイコファング', type: 'psychic', power: 85, accuracy: 100, pp: 10, category: 'physical' }),
    ],
  },
  {
    name: 'scizor',
    displayName: 'ハッサム',
    baseStats: { HP: 70, ATK: 130, DEF: 100, SPATK: 55, SPDEF: 80, SPEED: 65 },
    types: ['bug', 'steel'],
    ability: 'technician',
    item: 'rocky-helmet',
    nature: 'わんぱく',
    statPoints: { HP: 32, DEF: 32, ATK: 2 },
    moves: [
      createMove({ name: 'バレットパンチ', type: 'steel', power: 40, accuracy: 100, pp: 30, category: 'physical' }),
      createMove({ name: 'とんぼがえり', type: 'bug', power: 70, accuracy: 100, pp: 20, category: 'physical', pivot: true }),
      createMove({ name: 'こわいかお', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', targetStatChange: [{ stat: 'SPEED', delta: -2, chance: 100 }] }),
      createMove({ name: 'インファイト', type: 'fighting', power: 120, accuracy: 100, pp: 5, category: 'physical' }),
    ],
  },
  {
    name: 'primarina',
    displayName: 'アシレーヌ',
    baseStats: { HP: 80, ATK: 74, DEF: 74, SPATK: 126, SPDEF: 116, SPEED: 60 },
    types: ['water', 'fairy'],
    ability: 'torrent',
    item: 'sitrus-berry',
    nature: 'ひかえめ',
    statPoints: { SPATK: 32, HP: 32, SPDEF: 2 },
    moves: [
      createMove({ name: 'ムーンフォース', type: 'fairy', power: 95, accuracy: 100, pp: 15, category: 'special' }),
      createMove({ name: 'うたかたのアリア', type: 'water', power: 90, accuracy: 100, pp: 10, category: 'special' }),
      createMove({ name: 'アクアジェット', type: 'water', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
      createMove({ name: 'アンコール', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', inflictsEncore: true }),
    ],
  },
  {
    name: 'indeedee-male',
    displayName: 'イエッサン♂',
    baseStats: { HP: 60, ATK: 65, DEF: 55, SPATK: 105, SPDEF: 95, SPEED: 95 },
    types: ['psychic', 'normal'],
    ability: 'psychic-surge',
    item: 'terrain-extender',
    nature: 'おくびょう',
    statPoints: { SPATK: 32, SPEED: 32, HP: 2 },
    moves: [
      createMove({ name: 'ワイドフォース', type: 'psychic', power: 80, accuracy: 100, pp: 10, category: 'special', boostedByPsychicTerrain: true }),
      createMove({ name: 'マジカルフレイム', type: 'fire', power: 75, accuracy: 100, pp: 10, category: 'special' }),
      createMove({ name: 'アンコール', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', inflictsEncore: true }),
      createMove({ name: 'いやしのねがい', type: 'psychic', power: 0, accuracy: 100, pp: 10, category: 'status' }),
    ],
  },
    ],
  },
];
