import type {
  MoveCategory,
  TypeName,
  StatusCondition,
  MoveData,
  DamageMoveData,
  PhysicalMoveData,
  SpecialMoveData,
  StatusMoveData,
  CommonMoveEffects,
  DamageOnlyEffects,
  FieldEffect,
  SecondaryStatusEffect,
  SelfStatChange,
  TargetStatChange,
  WeatherType,
} from './types.js';

// 波動技（メガランチャーの対象）。カタログの表記（日本語）と英語IDの両方を受ける。
// 名前から既定値を決めるのは、構築カタログの全定義にフラグを書き足さなくて済むようにするため。
const PULSE_MOVE_NAMES = new Set([
  'はどうだん', 'あくのはどう', 'みずのはどう', 'りゅうのはどう', 'だいちのはどう', 'こんげんのはどう',
  'aura-sphere', 'dark-pulse', 'water-pulse', 'dragon-pulse', 'terrain-pulse', 'origin-pulse',
]);

// カテゴリを省略した技はダメージ技（物理）として扱う。
// 変化技は power の概念を持たないため、必ず category: 'status' の明示を要求する。
const DEFAULT_MOVE_CATEGORY = 'physical' as const;

const DEFAULT_POWER = 0;
const DEFAULT_ACCURACY = 100;
const DEFAULT_PP = 10;
const DEFAULT_PRIORITY = 0;

// --- コンストラクタ入力型（判別子は category） ---

// 全カテゴリ共通の入力。未指定のフィールドは上記の定数で補完される。
interface MoveInputBase extends CommonMoveEffects {
  name: string;
  type: TypeName;
  accuracy?: number;
  pp?: number;
  maxPP?: number;
  priority?: number;
  effectChance?: number | null;
}

// 物理技・特殊技の入力。category 省略時は物理技になる。
export interface DamageMoveInput extends MoveInputBase, DamageOnlyEffects {
  category?: 'physical' | 'special';
  power?: number;
}

// 変化技の入力。DamageOnlyEffects（multiHit 等）は型として受け付けない。
export interface StatusMoveInput extends MoveInputBase {
  category: 'status';
  power?: 0;
  status?: StatusCondition | null;
}

export type MoveInput = DamageMoveInput | StatusMoveInput;

// 後方互換のためのエイリアス（旧名）。新規コードでは MoveInput を使う。
export type MoveConstructorData = MoveInput;

// --- 技クラス ---

// 物理技・特殊技が共有する実装。category は派生クラスが確定させる。
abstract class DamageMoveBase implements Omit<DamageMoveData, 'category'> {
  abstract readonly category: 'physical' | 'special';
  name: string;
  type: TypeName;
  power: number;
  accuracy: number;
  pp: number;
  maxPP: number;
  priority: number;
  effectChance: number | null;
  fieldEffect: FieldEffect | null;
  secondaryEffect: SecondaryStatusEffect | null;
  selfStatChange: SelfStatChange[] | null;
  targetStatChange: TargetStatChange[] | null;
  inflictsSeed: boolean;
  weatherHeal: boolean;
  weather: WeatherType | null;
  multiHit: boolean;
  maxHits?: number;
  multiHitPowers?: number[];
  pivot: boolean;
  // バトンタッチ等: 交代時に能力変化を引き継ぐ。
  passStats: boolean;
  // アシストパワー: 能力上昇の合計で威力が上がる。
  storedPower: boolean;
  crashDamage: boolean;
  contact: boolean;
  restoresShieldForm: boolean;
  inflictsSpikes: boolean;
  inflictsDrowsy: boolean;
  selfHealPercent: number | null;
  usesDefenseForAttack: boolean;
  inflictsEncore: boolean;
  boostedByPsychicTerrain: boolean;
  resetsStatStages: boolean;
  createsSubstitute: boolean;
  protects: boolean;
  rests: boolean;
  wishes: boolean;
  forcesSwitch: boolean;
  drainPercent: number | null;
  ignoresTypeEffectiveness: boolean;
  recoilPercent: number | null;
  recoilMaxHpPercent: number | null;
  usesTargetAttack: boolean;
  weightBasedPower: boolean;
  knockOff: boolean;
  failsIfNoItem: boolean;
  doublesIfTargetDamaged: boolean;
  powerPerFaintedAlly: boolean;
  priorityInGrassyTerrain: boolean;
  alwaysCrit: boolean;
  failsUnlessTargetAttacks: boolean;
  terrainPulse: boolean;
  pulse: boolean;

  constructor(data: DamageMoveInput) {
    this.name = data.name;
    this.type = data.type;
    this.power = data.power ?? DEFAULT_POWER;
    this.accuracy = data.accuracy ?? DEFAULT_ACCURACY;
    this.pp = data.pp ?? DEFAULT_PP;
    this.maxPP = data.maxPP ?? data.pp ?? DEFAULT_PP;
    this.priority = data.priority ?? DEFAULT_PRIORITY;
    this.effectChance = data.effectChance ?? null;
    this.fieldEffect = data.fieldEffect ?? null;
    this.secondaryEffect = data.secondaryEffect ?? null;
    this.selfStatChange = data.selfStatChange ?? null;
    this.targetStatChange = data.targetStatChange ?? null;
    this.inflictsSeed = data.inflictsSeed ?? false;
    this.weatherHeal = data.weatherHeal ?? false;
    this.weather = data.weather ?? null;
    this.multiHit = data.multiHit ?? false;
    this.maxHits = data.maxHits;
    this.multiHitPowers = data.multiHitPowers;
    this.pivot = data.pivot ?? false;
    this.passStats = data.passStats ?? false;
    this.storedPower = data.storedPower ?? false;
    this.crashDamage = data.crashDamage ?? false;
    this.contact = data.contact ?? false;
    this.restoresShieldForm = data.restoresShieldForm ?? false;
    this.inflictsSpikes = data.inflictsSpikes ?? false;
    this.inflictsDrowsy = data.inflictsDrowsy ?? false;
    this.selfHealPercent = data.selfHealPercent ?? null;
    this.usesDefenseForAttack = data.usesDefenseForAttack ?? false;
    this.inflictsEncore = data.inflictsEncore ?? false;
    this.boostedByPsychicTerrain = data.boostedByPsychicTerrain ?? false;
    this.resetsStatStages = data.resetsStatStages ?? false;
    this.createsSubstitute = data.createsSubstitute ?? false;
    this.protects = data.protects ?? false;
    this.rests = data.rests ?? false;
    this.wishes = data.wishes ?? false;
    this.forcesSwitch = data.forcesSwitch ?? false;
    this.drainPercent = data.drainPercent ?? null;
    this.ignoresTypeEffectiveness = data.ignoresTypeEffectiveness ?? false;
    this.recoilPercent = data.recoilPercent ?? null;
    this.recoilMaxHpPercent = data.recoilMaxHpPercent ?? null;
    this.usesTargetAttack = data.usesTargetAttack ?? false;
    this.weightBasedPower = data.weightBasedPower ?? false;
    this.knockOff = data.knockOff ?? false;
    this.failsIfNoItem = data.failsIfNoItem ?? false;
    this.doublesIfTargetDamaged = data.doublesIfTargetDamaged ?? false;
    this.powerPerFaintedAlly = data.powerPerFaintedAlly ?? false;
    this.priorityInGrassyTerrain = data.priorityInGrassyTerrain ?? false;
    this.alwaysCrit = data.alwaysCrit ?? false;
    this.failsUnlessTargetAttacks = data.failsUnlessTargetAttacks ?? false;
    this.terrainPulse = data.terrainPulse ?? false;
    this.pulse = data.pulse ?? PULSE_MOVE_NAMES.has(data.name);
  }
}

// 物理技（攻撃・防御の実数値を参照する）
export class PhysicalMove extends DamageMoveBase implements PhysicalMoveData {
  readonly category = 'physical' as const;
}

// 特殊技（特攻・特防の実数値を参照する）
export class SpecialMove extends DamageMoveBase implements SpecialMoveData {
  readonly category = 'special' as const;
}

// 変化技（ダメージを与えないため power は 0 固定）
export class StatusMove implements StatusMoveData {
  readonly category = 'status' as const;
  readonly power = 0 as const;
  name: string;
  type: TypeName;
  accuracy: number;
  pp: number;
  maxPP: number;
  status: StatusCondition | null;
  priority: number;
  effectChance: number | null;
  fieldEffect: FieldEffect | null;
  selfStatChange: SelfStatChange[] | null;
  targetStatChange: TargetStatChange[] | null;
  inflictsSeed: boolean;
  weatherHeal: boolean;
  weather: WeatherType | null;
  pivot: boolean;
  passStats: boolean;
  restoresShieldForm: boolean;
  inflictsDrowsy: boolean;
  selfHealPercent: number | null;
  inflictsEncore: boolean;
  boostedByPsychicTerrain: boolean;
  resetsStatStages: boolean;
  createsSubstitute: boolean;
  protects: boolean;
  rests: boolean;
  wishes: boolean;
  forcesSwitch: boolean;

  constructor(data: StatusMoveInput) {
    this.name = data.name;
    this.type = data.type;
    this.accuracy = data.accuracy ?? DEFAULT_ACCURACY;
    this.pp = data.pp ?? DEFAULT_PP;
    this.maxPP = data.maxPP ?? data.pp ?? DEFAULT_PP;
    this.status = data.status ?? null;
    this.priority = data.priority ?? DEFAULT_PRIORITY;
    this.effectChance = data.effectChance ?? null;
    this.fieldEffect = data.fieldEffect ?? null;
    this.selfStatChange = data.selfStatChange ?? null;
    this.targetStatChange = data.targetStatChange ?? null;
    this.inflictsSeed = data.inflictsSeed ?? false;
    this.weatherHeal = data.weatherHeal ?? false;
    this.weather = data.weather ?? null;
    this.pivot = data.pivot ?? false;
    this.passStats = data.passStats ?? false;
    this.restoresShieldForm = data.restoresShieldForm ?? false;
    this.inflictsDrowsy = data.inflictsDrowsy ?? false;
    this.selfHealPercent = data.selfHealPercent ?? null;
    this.inflictsEncore = data.inflictsEncore ?? false;
    this.boostedByPsychicTerrain = data.boostedByPsychicTerrain ?? false;
    this.resetsStatStages = data.resetsStatStages ?? false;
    this.createsSubstitute = data.createsSubstitute ?? false;
    this.protects = data.protects ?? false;
    this.rests = data.rests ?? false;
    this.wishes = data.wishes ?? false;
    this.forcesSwitch = data.forcesSwitch ?? false;
  }
}

// ダメージを与える技（物理・特殊）のクラス union
export type DamageMove = PhysicalMove | SpecialMove;

// 全カテゴリの技（判別子: category）
export type Move = DamageMove | StatusMove;

// --- 型ガード（MoveData / Move の絞り込みはここに集約する） ---

// ダメージ技（物理・特殊）か。true なら multiHit・secondaryEffect 等にアクセスできる。
export function isDamageMove(move: MoveData): move is DamageMoveData {
  return move.category !== 'status';
}

// 変化技か。true なら status（付与する状態異常）にアクセスできる。
export function isStatusMove(move: MoveData): move is StatusMoveData {
  return move.category === 'status';
}

export function isPhysicalMove(move: MoveData): move is PhysicalMoveData {
  return move.category === 'physical';
}

export function isSpecialMove(move: MoveData): move is SpecialMoveData {
  return move.category === 'special';
}

// --- 技の分類 ---

// 技の分類の単一の情報源。MoveCategory の実体はここで列挙する。
export const MOVE_CATEGORIES = ['physical', 'special', 'status'] as const;

const MOVE_CATEGORY_SET: ReadonlySet<string> = new Set(MOVE_CATEGORIES);

// 外部データ（Poke API のレスポンス等）が既知の技分類かを検証する。
export function isMoveCategory(value: string): value is MoveCategory {
  return MOVE_CATEGORY_SET.has(value);
}

// --- 技の対象判定 ---

// 相手を対象に取る技かどうか。
// ダメージ技は常に相手を対象に取る。変化技は、状態異常の付与・相手の能力ランク変化・
// やどりぎのタネのいずれかを持つものだけが相手を対象に取り、
// 天候・場・自分自身への効果しか持たない変化技（あまごい・つるぎのまい等）は対象を取らない。
export function targetsOpponent(move: MoveData): boolean {
  if (isDamageMove(move)) return true;
  if (move.status !== null) return true;
  if (move.inflictsSeed === true) return true;

  const targetStatChange = move.targetStatChange ?? null;
  return targetStatChange !== null && targetStatChange.length > 0;
}

// --- ファクトリ ---

export function createMove(data: StatusMoveInput): StatusMove;
export function createMove(data: DamageMoveInput): DamageMove;
export function createMove(data: MoveInput): Move;
export function createMove(data: MoveInput): Move {
  if (data.category === 'status') {
    return new StatusMove(data);
  }

  // 変化技以外は全てダメージ技。category 省略時は物理技として扱う。
  const damageCategory = data.category ?? DEFAULT_MOVE_CATEGORY;
  if (damageCategory === 'special') {
    return new SpecialMove(data);
  }
  return new PhysicalMove(data);
}

// --- 技の複製 ---

// 技を独立したインスタンスとして複製する。
//
// BattleEngine は使用時に `move.pp -= 1` で技オブジェクト自体を書き換える。同じ MoveData を
// 複数の Pokemon に渡すと PP が共有され、同じ構築のミラー対戦で PP が二重に減る。
// カタログのように「1つのテンプレートから何体も作る」場合は必ずこれで複製する。
export function cloneMove(move: MoveData): MoveData {
  if (move.category === 'status') return createMove({ ...move, category: 'status' });
  if (move.category === 'physical') return createMove({ ...move, category: 'physical' });
  return createMove({ ...move, category: 'special' });
}

// 威力・タイプを差し替えたダメージ技を複製する
// （STAB補正・天候によるタイプ変化・多段ヒットごとの威力調整で使う）。
// オブジェクトスプレッドは union を分配しないため、category ごとに明示して判別子を保つ。
export function cloneDamageMove(
  move: DamageMoveData,
  overrides: { power?: number; type?: TypeName },
): DamageMoveData {
  if (move.category === 'physical') {
    return { ...move, ...overrides, category: 'physical' };
  }
  return { ...move, ...overrides, category: 'special' };
}


// わるあがき: 技のPPがすべて尽きたときだけ使える無タイプの攻撃。
// タイプ相性を受けず、与えたダメージの1/4を反動で受ける（本編仕様）。
export const STRUGGLE_MOVE_NAME = 'わるあがき';

export function createStruggleMove(): DamageMove {
  return createMove({
    name: STRUGGLE_MOVE_NAME,
    type: 'normal',
    power: 50,
    accuracy: 100,
    pp: 1,
    category: 'physical',
    ignoresTypeEffectiveness: true,
    recoilPercent: 0.25,
  });
}
