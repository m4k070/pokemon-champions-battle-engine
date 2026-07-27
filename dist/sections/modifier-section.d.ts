import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';
export interface ModifierResult {
    finalDamage: number;
    effectiveness: number;
}
export declare class ModifierSection {
    private engine;
    constructor(engine: BattleEngine);
    applyModifiers(baseDamage: number, attacker: Pokemon, defender: Pokemon, move: MoveData): ModifierResult;
}
//# sourceMappingURL=modifier-section.d.ts.map