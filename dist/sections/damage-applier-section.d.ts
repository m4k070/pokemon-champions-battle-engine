import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
export declare class DamageApplierSection {
    private engine;
    constructor(engine: BattleEngine);
    applyDamage(defender: Pokemon, damage: number): void;
}
//# sourceMappingURL=damage-applier-section.d.ts.map