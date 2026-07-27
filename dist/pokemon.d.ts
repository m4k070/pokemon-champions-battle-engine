import type { BaseStats, MoveData, StatusCondition, Stats, TypeName } from './types.js';
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
export declare class Pokemon {
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
    isFainted: boolean;
    baseName: string;
    isMega: boolean;
    constructor(data: PokémonConstructorData);
    static calculateStats(baseStats: BaseStats, level: number): Stats;
    takeDamage(damage: number, engine?: BattleEngine): void;
    heal(amount: number): void;
    applyStatus(status: StatusCondition): boolean;
    removeStatus(): void;
    canUseMove(moveIndex: number): boolean;
    lockMove(moveIndex: number): void;
    resetLockedMove(): void;
}
//# sourceMappingURL=pokemon.d.ts.map