import type { BaseStats, MoveData, StatusCondition, Stats, StatStageKey, StatStages, TypeName, FormName, FormDefinition, FormChangeResult } from './types.js';
import type { BattleEngine } from './battle-engine.js';
import type { AbilityName } from './ability-names.js';
import type { ItemName } from './item-names.js';
import { createStatusState, statusConditionOf, NO_STATUS } from './status-state.js';
import type { StatusState } from './status-state.js';
import type { NatureInput, StatPointsInput } from './rules/stat-point-system.js';
import { StatPointSystem } from './rules/stat-point-system.js';

// 実数値計算はChampions固有ルールの一部なのでStatPointSystemに集約する
// （Pokemon側に独自実装を持たせると能力ポイント・性格の反映漏れが起きるため）。
const statPointSystem = new StatPointSystem();

const STAT_STAGE_MIN = -6;
const STAT_STAGE_MAX = 6;

function zeroStatStages(): StatStages {
  return { ATK: 0, DEF: 0, SPATK: 0, SPDEF: 0, SPEED: 0 };
}

export interface PokémonConstructorData {
  name: string;
  types: TypeName[];
  ability: AbilityName;
  item: ItemName | null;
  baseStats: BaseStats;
  stats?: Stats;
  // 能力ポイント（1ポイント=実数値1）。省略時は無振り。statsを直接渡した場合は使われない。
  statPoints?: StatPointsInput;
  // 性格。省略時は無補正。statsを直接渡した場合は使われない。
  nature?: NatureInput;
  moves?: MoveData[];
  level?: number;
  currentHP?: number;
  // 状態異常。ねむりの残りターン・猛毒の経過ターンも含めてこの1値で表す。
  statusState?: StatusState;
  baseName?: string;
  isMega?: boolean;
  itemUsed?: boolean;
  lockedMove?: number | null;
  statStages?: StatStages;
  isSeeded?: boolean;
  // ちょうはつ: trueの間、攻撃技を使えない（2〜4ターン）。交代で解除。
  tauntTurnsLeft?: number;
  // フォルムチェンジ（バトルスイッチ等）。現在のフォルム名と、フォルム別種族値。
  form?: FormName;
  formStats?: Record<string, FormDefinition>;
}

export class Pokemon {
  name: string;
  types: TypeName[];
  ability: AbilityName;
  item: ItemName | null;
  itemUsed: boolean;
  lockedMove: number | null;
  baseStats: BaseStats;
  statPoints: StatPointsInput;
  nature: NatureInput;
  stats: Stats;
  moves: MoveData[];
  currentHP: number;
  maxHP: number;
  // 状態異常の唯一の情報源。種類ごとに必要な値（ねむりの残りターン等）だけを持つ。
  statusState: StatusState;
  baseName: string;
  isMega: boolean;
  statStages: StatStages;
  // やどりぎのタネ: trueの間、毎ターン相手からHPを吸われる（交代で治る揮発性の状態）。
  isSeeded: boolean;
  // ちょうはつ: trueの間、攻撃技を使えない（2〜4ターン）。交代で解除。
  tauntTurnsLeft: number;
  // フォルムチェンジ（バトルスイッチ等）。現在のフォルム名。formStats 未指定なら 'normal'。
  form: FormName;
  // フォルム別定義。例: ギルガルド { shield: { baseStats: {...} }, blade: { baseStats: {...} } }。未指定なら変更不可。
  formStats: Record<string, FormDefinition> | null;
  // レベル（実数値の再計算に使用）。省略時は50。
  level: number;

  constructor(data: PokémonConstructorData) {
    this.name = data.name;
    this.types = data.types;
    this.ability = data.ability;
    this.item = data.item ?? null;
    this.itemUsed = data.itemUsed ?? false;
    this.lockedMove = data.lockedMove ?? null;
    this.baseStats = data.baseStats;
    this.moves = data.moves ?? [];
    this.statusState = data.statusState ?? NO_STATUS;
    this.baseName = data.baseName ?? data.name;
    this.isMega = data.isMega ?? false;
    this.statStages = data.statStages ? { ...data.statStages } : zeroStatStages();
    this.isSeeded = data.isSeeded ?? false;
    this.tauntTurnsLeft = data.tauntTurnsLeft ?? 0;
    this.form = data.form ?? 'normal';
    this.formStats = data.formStats ?? null;
    this.level = data.level ?? 50;

    this.statPoints = data.statPoints ?? {};
    this.nature = data.nature ?? null;

    if (data.stats) {
      this.stats = { ...data.stats };
    } else {
      this.stats = statPointSystem.calculateStats(
        data.baseStats,
        this.statPoints,
        this.nature,
        data.level ?? 50,
      );
    }
    this.maxHP = this.stats.HP;
    this.currentHP = data.currentHP ?? this.maxHP;
  }

  // 能力ランクを変更する。-6〜+6でクランプし、実際に変化した段階数を返す
  // （「これ以上下がらない」等のログ判定に使う）。
  // あまのじゃく(contrary)持ちは変化の向きそのものを反転させる。自分の技(リーフストーム等)にも
  // 相手からの効果(いかく等)にも同じ理屈で効くため、変化元を問わずここ一箇所で反転させる。
  modifyStatStage(stat: StatStageKey, delta: number): number {
    const effectiveDelta = this.ability === 'contrary' ? -delta : delta;
    const before = this.statStages[stat];
    const after = Math.max(STAT_STAGE_MIN, Math.min(STAT_STAGE_MAX, before + effectiveDelta));
    this.statStages[stat] = after;
    return after - before;
  }

  getStatStageMultiplier(stat: StatStageKey): number {
    const stage = this.statStages[stat];
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  // 交代で場を離れると能力ランクはリセットされる（本編仕様）。
  resetStatStages(): void {
    this.statStages = zeroStatStages();
  }

  // フォルムチェンジ。formStats に存在するフォルムへ移行し、種族値を差し替えて
  // 実数値を再計算する。HP はフォルム間で変わらない前提（ギルガルド等）で維持する。
  // 存在しないフォルム名・formStats 未指定なら何もしない。
  setForm(form: FormName): FormChangeResult {
    if (!this.formStats) return { outcome: 'unchanged', reason: 'no-forms' };
    if (!this.formStats[form]) return { outcome: 'unchanged', reason: 'unknown-form' };
    if (this.form === form) return { outcome: 'unchanged', reason: 'same-form' };
    const from = this.form;
    this.form = form;
    const level = this.level;
    this.stats = statPointSystem.calculateStats(this.formStats[form].baseStats, this.statPoints, this.nature, level);
    return { outcome: 'changed', from, to: form };
  }

  // 状態異常の種類のみを返す派生プロパティ（statusStateが唯一の情報源）。
  get status(): StatusCondition | null {
    return statusConditionOf(this.statusState);
  }

  // currentHPから導出する（保存フィールドにすると直接代入時に同期が崩れるため）。
  get isFainted(): boolean {
    return this.currentHP <= 0;
  }

  static calculateStats(
    baseStats: BaseStats,
    level: number,
    statPoints: StatPointsInput = {},
    nature: NatureInput = null,
  ): Stats {
    return statPointSystem.calculateStats(baseStats, statPoints, nature, level);
  }

  takeDamage(damage: number, engine?: BattleEngine): void {
    let effectiveDamage = damage;
    if (engine) {
      const data = { defender: this, damage, engine };
      engine.events.emit('apply-damage', data);
      effectiveDamage = data.damage;
    }
    this.currentHP = Math.max(0, this.currentHP - effectiveDamage);
  }

  heal(amount: number): void {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }

  // 既に別の状態異常なら重複してかからない（本編仕様）。
  applyStatus(status: StatusCondition): boolean {
    if (this.statusState.kind !== 'none') return false;
    this.statusState = createStatusState(status);
    return true;
  }

  removeStatus(): void {
    this.statusState = NO_STATUS;
  }

  // 交代で場を離れると猛毒の経過ターン数はリセットされる（本編仕様）。
  // ※猛毒状態自体は交代しても治らないため、状態異常そのものは維持する。
  resetToxicCounter(): void {
    if (this.statusState.kind !== 'badly-poisoned') return;
    this.statusState = { kind: 'badly-poisoned', elapsedTurns: 0 };
  }

  // 猛毒の経過ターンを1進める（上限まで）。進めた後の経過ターン数を返す。
  // 猛毒でなければ何もせず0を返す。
  advanceToxicCounter(maxElapsedTurns: number): number {
    if (this.statusState.kind !== 'badly-poisoned') return 0;
    const elapsedTurns = Math.min(this.statusState.elapsedTurns + 1, maxElapsedTurns);
    this.statusState = { kind: 'badly-poisoned', elapsedTurns };
    return elapsedTurns;
  }

  // ねむりの残りターンを1減らす。0になった時点で目を覚ます。
  // 減らした後の残りターン数を返す（ねむりでなければ0）。
  consumeSleepTurn(): number {
    if (this.statusState.kind !== 'sleep') return 0;
    const turnsLeft = this.statusState.turnsLeft - 1;
    if (turnsLeft <= 0) {
      this.removeStatus();
      return 0;
    }
    this.statusState = { kind: 'sleep', turnsLeft };
    return turnsLeft;
  }

  // やどりぎのタネは（能力ランクと違い）交代すると状態自体が解除される揮発性の状態。
  resetSeeded(): void {
    this.isSeeded = false;
  }

  // ちょうはつ: 攻撃技を使えない状態（2〜4ターン）。交代で解除。
  get isTaunted(): boolean {
    return this.tauntTurnsLeft > 0;
  }

  applyTaunt(turns: number): void {
    this.tauntTurnsLeft = turns;
  }

  // 交代で場を離れると挑発状態は解除される（本編仕様）。
  resetTaunt(): void {
    this.tauntTurnsLeft = 0;
  }

  canUseMove(moveIndex: number): boolean {
    if (this.lockedMove !== null && this.lockedMove !== moveIndex) {
      return false;
    }
    return true;
  }

  lockMove(moveIndex: number): void {
    if (this.item === 'choice-scarf' || this.item === 'choice-band' || this.item === 'choice-specs') {
      this.lockedMove = moveIndex;
    }
  }

  resetLockedMove(): void {
    this.lockedMove = null;
  }
}
