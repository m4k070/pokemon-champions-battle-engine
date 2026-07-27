import type { BaseStats, Stats, StatKey } from '../types.js';

export interface StatPointsData {
  HP: number;
  ATK: number;
  DEF: number;
  SPATK: number;
  SPDEF: number;
  SPEED: number;
}

export class StatPointSystem {
  readonly maxPointsPerStat = 32;
  readonly maxTotalPoints = 66;

  validateStatPoints(points: StatPointsData): boolean {
    const total = Object.values(points).reduce((sum, val) => sum + val, 0);

    if (total > this.maxTotalPoints) {
      throw new Error(`能力ポイント合計が上限を超えています: ${total}/${this.maxTotalPoints}`);
    }

    for (const [stat, value] of Object.entries(points)) {
      if (value > this.maxPointsPerStat) {
        throw new Error(`${stat}の能力ポイントが上限を超えています: ${value}/${this.maxPointsPerStat}`);
      }
    }

    return true;
  }

  calculateStats(baseStats: BaseStats, statPoints: StatPointsData, level = 50): Stats {
    this.validateStatPoints(statPoints);

    return {
      HP: Math.floor(((baseStats.HP * 2 + 31 + Math.floor(statPoints.HP / 4)) * level) / 100) + level + 10,
      ATK: Math.floor(((baseStats.ATK * 2 + 31 + Math.floor(statPoints.ATK / 4)) * level) / 100) + 5,
      DEF: Math.floor(((baseStats.DEF * 2 + 31 + Math.floor(statPoints.DEF / 4)) * level) / 100) + 5,
      SPATK: Math.floor(((baseStats.SPATK * 2 + 31 + Math.floor(statPoints.SPATK / 4)) * level) / 100) + 5,
      SPDEF: Math.floor(((baseStats.SPDEF * 2 + 31 + Math.floor(statPoints.SPDEF / 4)) * level) / 100) + 5,
      SPEED: Math.floor(((baseStats.SPEED * 2 + 31 + Math.floor(statPoints.SPEED / 4)) * level) / 100) + 5,
    };
  }
}

export class Level50System {
  private system: StatPointSystem;

  constructor() {
    this.system = new StatPointSystem();
  }

  calculateStats(baseStats: BaseStats, statPoints: StatPointsData): Stats {
    return this.system.calculateStats(baseStats, statPoints, 50);
  }
}
