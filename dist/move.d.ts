import type { MoveCategory, TypeName, StatusCondition, MoveData } from './types.js';
export interface MoveConstructorData {
    name: string;
    type: TypeName;
    power?: number;
    accuracy?: number;
    pp?: number;
    maxPP?: number;
    category?: MoveCategory;
    status?: StatusCondition | null;
    priority?: number;
    effectChance?: number | null;
}
export declare class Move implements MoveData {
    name: string;
    type: TypeName;
    power: number;
    accuracy: number;
    pp: number;
    maxPP: number;
    category: MoveCategory;
    status: StatusCondition | null;
    priority: number;
    effectChance: number | null;
    constructor(data: MoveConstructorData);
}
//# sourceMappingURL=move.d.ts.map