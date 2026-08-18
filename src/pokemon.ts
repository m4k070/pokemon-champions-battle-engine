import type { BaseStats, MoveData, StatusCondition, Stats, StatStageKey, StatStages, TypeName } from './types.js';
import type { BattleEngine } from './battle-engine.js';
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
  ability: string;
  item: string | null;
  baseStats: BaseStats;
  stats?: Stats;
  // 能力ポイント（1ポイント=実数値1）。省略時は無振り。statsを直接渡した場合は使われない。
  statPoints?: StatPointsInput;
  // 性格。省略時は無補正。statsを直接渡した場合は使われない。
  nature?: NatureInput;
  moves?: MoveData[];
  level?: number;
  currentHP?: number;
  status?: StatusCondition | null;
  statusTurnsLeft?: number;
  baseName?: string;
  isMega?: boolean;
  itemUsed?: boolean;
  lockedMove?: number | null;
  statStages?: StatStages;
  toxicCounter?: number;
  isSeeded?: boolean;
  // フォルムチェンジ（バトルスイッチ等）。現在のフォルム名と、フォルム別種族値。
  form?: string;
  formStats?: Record<string, BaseStats>;
}

export class Pokemon {
  name: string;
  types: TypeName[];
  ability: string;
  item: string | null;
  itemUsed: boolean;
  lockedMove: number | null;
  baseStats: BaseStats;
  statPoints: StatPointsInput;
  nature: NatureInput;
  stats: Stats;
  moves: MoveData[];
  currentHP: number;
  maxHP: number;
  status: StatusCondition | null;
  statusTurnsLeft: number;
  baseName: string;
  isMega: boolean;
  statStages: StatStages;
  // 猛毒(どくどく)の経過ターン数。ダメージがターンごとにfloor(maxHP*n/16)と増加していくためのカウンタ。
  toxicCounter: number;
  // やどりぎのタネ: trueの間、毎ターン相手からHPを吸われる（交代で治る揮発性の状態）。
  isSeeded: boolean;
  // フォルムチェンジ（バトルスイッチ等）。現在のフォルム名。formStats 未指定なら 'normal'。
  form: string;
  // フォルム別種族値。例: ギルガルド { shield: {...}, blade: {...} }。未指定なら変更不可。
  formStats: Record<string, BaseStats> | null;
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
    this.status = data.status ?? null;
    this.statusTurnsLeft = data.statusTurnsLeft ?? 0;
    this.baseName = data.baseName ?? data.name;
    this.isMega = data.isMega ?? false;
    this.statStages = data.statStages ? { ...data.statStages } : zeroStatStages();
    this.toxicCounter = data.toxicCounter ?? 0;
    this.isSeeded = data.isSeeded ?? false;
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
  setForm(form: string): boolean {
    if (!this.formStats || !this.formStats[form]) return false;
    if (this.form === form) return false;
    this.form = form;
    const level = this.level;
    this.stats = statPointSystem.calculateStats(this.formStats[form], this.statPoints, this.nature, level);
    return true;
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

  applyStatus(status: StatusCondition): boolean {
    if (this.status) return false;
    this.status = status;
    if (status === 'sleep') {
      this.statusTurnsLeft = Math.floor(Math.random() * 3) + 1;
    }
    if (status === 'badly-poisoned') {
      this.toxicCounter = 0;
    }
    return true;
  }

  removeStatus(): void {
    this.status = null;
    this.statusTurnsLeft = 0;
    this.toxicCounter = 0;
  }

  // 交代で場を離れると猛毒の経過ターン数はリセットされる（本編仕様）。
  // ※猛毒状態自体は交代しても治らないため、statusはそのままにする。
  resetToxicCounter(): void {
    this.toxicCounter = 0;
  }

  // やどりぎのタネは（能力ランクと違い）交代すると状態自体が解除される揮発性の状態。
  resetSeeded(): void {
    this.isSeeded = false;
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
