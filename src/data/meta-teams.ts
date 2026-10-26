import type { BaseStats, FormDefinition, FormName, MoveData, TypeName } from '../types.js';
import type { NatureInput, StatPointsInput } from '../rules/stat-point-system.js';
import type { AbilityName } from '../ability-names.js';
import type { ItemName } from '../item-names.js';
import { readFileSync } from 'node:fs';
import { createMove, cloneMove } from '../move.js';
import type { MoveInput } from '../move.js';
import { Pokemon } from '../pokemon.js';

// 構築カタログの型と、カタログの1体・1構築を Pokemon にする変換。
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

type RawMember = Omit<MetaTeamMember, 'moves'> & { moves: MoveInput[] };
type RawEntry = Omit<MetaTeamEntry, 'members'> & { members: RawMember[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// 形だけ確かめる（6体・4技の数や値の妥当性はカタログ側のテストで固定する）。
function isRawCatalog(value: unknown): value is RawEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.name === 'string' &&
        Array.isArray(entry.members) &&
        entry.members.every(
          (member) =>
            isRecord(member) &&
            typeof member.name === 'string' &&
            Array.isArray(member.moves) &&
            member.moves.every((move) => isRecord(move) && typeof move.name === 'string' && typeof move.type === 'string'),
        ),
    )
  );
}

// カタログ（構築データ）はエンジンに含めない。研究用リポジトリが JSON で持ち、
// 使う側が loadMetaTeams で読み込む。技は JSON の MoveData から作り直す。
export function loadMetaTeams(path: string): MetaTeamEntry[] {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRawCatalog(raw)) throw new Error(`構築カタログの形式が不正: ${path}`);
  return raw.map((entry) => ({
    ...entry,
    members: entry.members.map((member) => ({ ...member, moves: member.moves.map((move) => createMove(move)) })),
  }));
}
