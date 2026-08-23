export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type MoveCategory = 'physical' | 'special' | 'status';

export type StatusCondition = 'sleep' | 'poison' | 'burn' | 'paralysis' | 'freeze' | 'badly-poisoned';

export type WeatherType = 'sand' | 'rain' | 'sun' | 'hail';

export type StatKey = 'HP' | 'ATK' | 'DEF' | 'SPATK' | 'SPDEF' | 'SPEED';

export type BaseStats = Record<StatKey, number>;
export type Stats = Record<StatKey, number>;

// 能力ランクの対象はHPを除く5ステータス（-6〜+6）。
export type StatStageKey = Exclude<StatKey, 'HP'>;
export type StatStages = Record<StatStageKey, number>;

// 天候・フィールドではなく「陣営の場」に対して発動する効果技（おいかぜ・リフレクター）と、
// 盤面全体に対して発動する効果技（トリックルーム）。
// ハザード（ステルスロック・まきびし・どくびし）もここに含める。
// ひけんちえなみは「まきびしを設置する追加効果を持つ技」のため fieldEffect には含めない。
export type FieldEffect =
  | 'tailwind' | 'trick-room' | 'reflect'
  | 'stealth-rock' | 'spikes' | 'toxic-spikes';

// ダメージ技に追加効果として付随する状態異常（例: れいとうパンチの10%こおり）。
// status(ダメージ0の状態異常専用技)とは別概念のため独立したフィールドとして持つ。
export interface SecondaryStatusEffect {
  status: StatusCondition;
  chance: number; // 0-100（%）
}

// 技の使用者自身に能力ランク変化を与える（つるぎのまい・りゅうのまい等）。
// リーフストームのように威力を持つ技に付随することもある。
export interface SelfStatChange {
  stat: StatStageKey;
  delta: number;
}

// 命中した相手に能力ランク変化を与える（バークアウトの特攻ダウン等）。
// chance未満の乱数なら発動しない（バークアウト等は確定=100を指定する）。
export interface TargetStatChange {
  stat: StatStageKey;
  delta: number;
  chance: number; // 0-100（%）
}

// --- 技の共通フィールドと効果 ---

// カテゴリによらず全ての技が持つ識別・基礎情報。
interface MoveIdentity {
  name: string;
  type: TypeName;
  accuracy: number;
  pp: number;
  maxPP: number;
  priority: number;
  effectChance: number | null;
}

// カテゴリによらず指定しうる効果（あさのひざしの回復・とんぼがえりの pivot 等）。
// ダメージ技にも変化技にも付随しうるため、両カテゴリで共有する。
export interface CommonMoveEffects {
  fieldEffect?: FieldEffect | null;
  selfStatChange?: SelfStatChange[] | null;
  targetStatChange?: TargetStatChange[] | null;
  inflictsSeed?: boolean;
  weatherHeal?: boolean;
  weather?: WeatherType | null;
  pivot?: boolean;
  restoresShieldForm?: boolean;
}

// ダメージ技だけが持つ効果。変化技はダメージを与えないため、
// 多段ヒット・反動・接触判定といった概念そのものを持たない。
export interface DamageOnlyEffects {
  secondaryEffect?: SecondaryStatusEffect | null;
  multiHit?: boolean;
  maxHits?: number;
  multiHitPowers?: number[];
  crashDamage?: boolean;
  contact?: boolean;
  inflictsSpikes?: boolean;
}

// --- discriminated union 型（判別子は category） ---

// 物理技・特殊技に共通するダメージ技のフィールド
interface DamageMoveDataBase extends MoveIdentity, CommonMoveEffects, DamageOnlyEffects {
  power: number;
}

// 物理技（攻撃・防御の実数値を参照する）
export interface PhysicalMoveData extends DamageMoveDataBase {
  category: 'physical';
}

// 特殊技（特攻・特防の実数値を参照する）
export interface SpecialMoveData extends DamageMoveDataBase {
  category: 'special';
}

// 変化技。ダメージを与えないため power は 0 固定で、DamageOnlyEffects を持たない。
export interface StatusMoveData extends MoveIdentity, CommonMoveEffects {
  category: 'status';
  power: 0;
  // 相手に付与する状態異常（おにび・でんじは等）。
  // ダメージ技の追加効果は DamageOnlyEffects.secondaryEffect 側が担当する。
  status: StatusCondition | null;
}

// ダメージを与える技。威力計算・多段ヒット処理はこの型でのみ扱う。
export type DamageMoveData = PhysicalMoveData | SpecialMoveData;

// 全カテゴリの技（判別子: category）。
// 型の絞り込みには move.ts の isDamageMove / isStatusMove を使う。
export type MoveData = DamageMoveData | StatusMoveData;

// --- フォルム関連の型 ---

// フォルム名の列挙（single source of truth）。
// 新しいフォルムを追加するときはここに追加する。
export const FORM_NAMES = ['normal', 'shield', 'blade'] as const;
export type FormName = typeof FORM_NAMES[number];

// フォルム定義（種族値のみ。将来的にフォルム固有の技・特性を追加可能）。
export interface FormDefinition {
  baseStats: BaseStats;
}

// フォルムチェンジの結果（discriminated union）。
export type FormChangeResult =
  | { outcome: 'changed'; from: FormName; to: FormName }
  | { outcome: 'unchanged'; reason: 'same-form' | 'unknown-form' | 'no-forms' };

export type TypeChart = Record<TypeName, Partial<Record<TypeName, number>>>;

export type BattleEventName =
  | 'switch-in'
  | 'end-turn'
  | 'calculate-attack'
  | 'calculate-defense'
  | 'apply-modifiers'
  | 'apply-damage'
  | 'before-move'
  | 'after-move';

export interface EventData {
  [key: string]: unknown;
}

export type EventHandler = (data: EventData) => void;

export interface MoveAction {
  type: 'move';
  moveIndex: number;
  target: number;
  // メガシンカは技の選択に添えて宣言する（交代・降参とは同時にできないため）。
  megaEvolve?: boolean;
}

export interface SwitchAction {
  type: 'switch';
  pokemonIndex: number;
}

export interface ForfeitAction {
  type: 'forfeit';
}

export type AgentAction = MoveAction | SwitchAction | ForfeitAction;
