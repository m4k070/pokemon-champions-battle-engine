import type { BaseStats, MoveData, StatusCondition, Stats, StatStageKey, StatStages, TypeName } from './types.js';
import type { BattleEngine } from './battle-engine.js';

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
}

export class Pokemon {
  name: string;
  types: TypeName[];
  ability: string;
  item: string | null;
  itemUsed: boolean;
  lockedMove: number | null;
  baseStats: BaseStats;
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

    if (data.stats) {
      this.stats = { ...data.stats };
    } else {
      this.stats = Pokemon.calculateStats(data.baseStats, data.level ?? 50);
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

  // currentHPから導出する（保存フィールドにすると直接代入時に同期が崩れるため）。
  get isFainted(): boolean {
    return this.currentHP <= 0;
  }

  static calculateStats(baseStats: BaseStats, level: number): Stats {
    return {
      HP: Math.floor(((baseStats.HP * 2 + 31) * level) / 100) + level + 10,
      ATK: Math.floor(((baseStats.ATK * 2 + 31) * level) / 100) + 5,
      DEF: Math.floor(((baseStats.DEF * 2 + 31) * level) / 100) + 5,
      SPATK: Math.floor(((baseStats.SPATK * 2 + 31) * level) / 100) + 5,
      SPDEF: Math.floor(((baseStats.SPDEF * 2 + 31) * level) / 100) + 5,
      SPEED: Math.floor(((baseStats.SPEED * 2 + 31) * level) / 100) + 5,
    };
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
