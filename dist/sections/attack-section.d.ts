import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';
export declare class AttackSection {
    private engine;
    constructor(engine: BattleEngine);
    calculate(attacker: Pokemon, move: MoveData): number;
}
//# sourceMappingURL=attack-section.d.ts.map