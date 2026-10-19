import type { BaseStats, FormDefinition, FormName, MoveData, TypeName } from '../types.js';
import type { NatureInput, StatPointsInput } from '../rules/stat-point-system.js';
import type { AbilityName } from '../ability-names.js';
import type { ItemName } from '../item-names.js';
import { createMove, cloneMove } from '../move.js';
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
  // フォルムを持つポケモン（ギルガルド等）の初期フォルムとフォルム別種族値。
  form?: FormName;
  formStats?: Record<string, FormDefinition>;
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
    // 技は Pokemon ごとに複製する（PP が共有されるとミラー対戦で二重に減る）。
    moves: member.moves.map(cloneMove),
    form: member.form,
    formStats: member.formStats,
  });
}

// カタログの1構築を6体の Pokemon にする。
export function teamToPokemons(entry: MetaTeamEntry): Pokemon[] {
  return entry.members.map(toPokemon);
}

export const META_TEAMS: MetaTeamEntry[] = [];
