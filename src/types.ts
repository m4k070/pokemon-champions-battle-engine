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
// 能力ランクのキーの一覧（Object.keys は string[] になるので、走査にはこちらを使う）。
export const STAT_STAGE_KEYS: readonly StatStageKey[] = ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'];

// 天候・フィールドではなく「陣営の場」に対して発動する効果技（おいかぜ・リフレクター）と、
// 盤面全体に対して発動する効果技（トリックルーム）。
// ハザード（ステルスロック・まきびし・どくびし）もここに含める。
// ひけんちえなみは「まきびしを設置する追加効果を持つ技」のため fieldEffect には含めない。
export type FieldEffect =
  | 'tailwind' | 'trick-room' | 'reflect'
  | 'stealth-rock' | 'spikes' | 'toxic-spikes'
  | 'psychic-terrain' | 'misty-terrain' | 'aurora-veil';

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
  // わるあがき専用: タイプ相性を無視する（本編のわるあがきは無タイプ）。
  ignoresTypeEffectiveness?: boolean;
  fieldEffect?: FieldEffect | null;
  selfStatChange?: SelfStatChange[] | null;
  targetStatChange?: TargetStatChange[] | null;
  inflictsSeed?: boolean;
  weatherHeal?: boolean;
  weather?: WeatherType | null;
  pivot?: boolean;
  restoresShieldForm?: boolean;
  // あくび: 相手を「ねむけ」にして、次のターン終了時にねむりにする（交代で解除）。
  inflictsDrowsy?: boolean;
  // なまける等: 自分のHPを最大HPの指定割合だけ回復する（0.5 = 半分）。
  selfHealPercent?: number | null;
  // アンコール: 相手が直前に使った技を3ターンの間使い続けさせる（交代で解除）。
  inflictsEncore?: boolean;
  // バトンタッチ: 交代先に能力変化（能力ランク）を引き継ぐ。
  passStats?: boolean;
  // アシストパワー: 自分の能力上昇の合計で威力が上がる（20 + 20×段数、上限860）。
  storedPower?: boolean;
  // ワイドフォース: サイコフィールド下で接地していれば威力1.5倍（本編仕様）。
  boostedByPsychicTerrain?: boolean;
  // くろいきり: 場に出ている全員の能力変化をリセットする（本編仕様）。
  resetsStatStages?: boolean;
  // みがわり: 自分のHPを1/4払って身代わりを出す（本編仕様）。
  createsSubstitute?: boolean;
  // まもる: そのターンの間、相手から受ける技を無効化する（本編仕様）。
  protects?: boolean;
  // ねむる: HPを全回復し、2ターンのねむり状態になる（本編仕様）。
  rests?: boolean;
  // ねがいごと: 次のターンの終了時に、その側の場に出ているポケモンを最大HPの半分回復する。
  wishes?: boolean;
  // ほえる・ドラゴンテール: 相手を控えと強制交代させる（本編仕様）。
  forcesSwitch?: boolean;
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
  // ボディプレス: ダメージ計算に「こうげき」ではなく「ぼうぎょ」を使う（本編仕様）。
  usesDefenseForAttack?: boolean;
  // ドレイン技（きゅうけつ・ギガドレイン等）: 与えたダメージの指定割合だけ回復する（0.5 = 半分）。
  drainPercent?: number | null;
  // 反動技（ウェーブタックル・フレアドライブ等）: 与えたダメージの指定割合を自分も受ける。
  recoilPercent?: number | null;
  // 反動技（てっていこうせん等）: 最大HPの指定割合を自分も受ける（与えたダメージに依存しない）。
  recoilMaxHpPercent?: number | null;
  // イカサマ: ダメージ計算に自分のこうげきではなく相手のこうげきを使う（本編仕様）。
  usesTargetAttack?: boolean;
  // くさむすび・けたぐり: 威力が相手の体重で決まる（本編仕様）。
  weightBasedPower?: boolean;
  // はたきおとす: 相手が落とせる持ち物を持っていれば威力1.5倍、命中後にその持ち物を落とす。
  knockOff?: boolean;
  // ポルターガイスト: 相手が持ち物を持っていなければ失敗する（本編仕様）。
  failsIfNoItem?: boolean;
  // ダメおし: そのターン既に相手がダメージを受けていれば威力2倍（本編仕様）。
  doublesIfTargetDamaged?: boolean;
  // トリックフラワー等: 必ず急所に当たる（本編仕様）。
  alwaysCrit?: boolean;
  // ふいうち: 相手がそのターン攻撃技を選んでいなければ失敗する（本編仕様）。
  failsUnlessTargetAttacks?: boolean;
  // 波動技（はどうだん・あくのはどう・だいちのはどう等）: メガランチャーで威力1.5倍（本編仕様）。
  pulse?: boolean;
  // だいちのはどう: フィールド下で使用者が接地していればタイプと威力が変わる（本編仕様）。
  terrainPulse?: boolean;
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
