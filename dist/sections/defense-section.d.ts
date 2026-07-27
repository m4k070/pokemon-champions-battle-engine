import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';
export declare class DefenseSection {
    private engine;
    constructor(engine: BattleEngine);
    calculate(defender: Pokemon, move: MoveData): number;
}
//# sourceMappingURL=defense-section.d.ts.map