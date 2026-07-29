import type { BaseStats, MoveData, StatusCondition, Stats, StatKey, TypeName } from './types.js';
import type { BattleEngine } from './battle-engine.js';

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

    if (data.stats) {
      this.stats = { ...data.stats };
    } else {
      this.stats = Pokemon.calculateStats(data.baseStats, data.level ?? 50);
    }
    this.maxHP = this.stats.HP;
    this.currentHP = data.currentHP ?? this.maxHP;
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
    return true;
  }

  removeStatus(): void {
    this.status = null;
    this.statusTurnsLeft = 0;
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
