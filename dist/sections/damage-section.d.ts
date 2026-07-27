import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';
export interface DamageResult {
    damage: number;
}
export declare class DamageSection {
    private engine;
    constructor(engine: BattleEngine);
    calculate(_attack: number, _defense: number, move: MoveData, attacker: Pokemon, defender: Pokemon): DamageResult;
}
//# sourceMappingURL=damage-section.d.ts.map