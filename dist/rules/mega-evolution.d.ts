import type { Pokemon } from '../pokemon.js';
import type { TypeName } from '../types.js';
export interface MegaStoneConfig {
    pokemon: string;
    megaName: string;
    typeChange: TypeName[];
    abilityChange: string;
}
export declare class MegaEvolutionSystem {
    megaStones: Record<string, MegaStoneConfig>;
    constructor();
    canMegaEvolve(pokemon: Pokemon): boolean;
    megaEvolve(pokemon: Pokemon): boolean;
}
//# sourceMappingURL=mega-evolution.d.ts.map