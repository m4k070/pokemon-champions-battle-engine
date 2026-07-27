import type { BaseStats, Stats } from '../types.js';
export interface StatPointsData {
    HP: number;
    ATK: number;
    DEF: number;
    SPATK: number;
    SPDEF: number;
    SPEED: number;
}
export declare class StatPointSystem {
    readonly maxPointsPerStat = 32;
    readonly maxTotalPoints = 66;
    validateStatPoints(points: StatPointsData): boolean;
    calculateStats(baseStats: BaseStats, statPoints: StatPointsData, level?: number): Stats;
}
export declare class Level50System {
    private system;
    constructor();
    calculateStats(baseStats: BaseStats, statPoints: StatPointsData): Stats;
}
//# sourceMappingURL=stat-point-system.d.ts.map