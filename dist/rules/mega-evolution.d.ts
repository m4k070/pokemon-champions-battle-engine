import type { Pokemon } from '../pokemon.js';
import type { TypeName } from '../types.js';
import type { PokeApiPokemonData } from '../api/pokemon-api.js';
declare const MEGA_STAT_KEYS: readonly ["ATK", "DEF", "SPATK", "SPDEF", "SPEED"];
export type MegaStatKey = (typeof MEGA_STAT_KEYS)[number];
export type MegaStatBoosts = Record<MegaStatKey, number>;
export interface MegaStoneConfig {
    pokemon: string;
    megaName: string;
    typeChange: TypeName[];
    abilityChange: string;
    statBoosts: MegaStatBoosts;
}
export interface MegaStoneSeed {
    pokemon: string;
    megaApiName: string;
    megaName: string;
}
export declare const MEGA_STONE_SEEDS: Record<string, MegaStoneSeed>;
export interface PokemonDataFetcher {
    fetchPokemonData(pokemonId: string | number): Promise<PokeApiPokemonData>;
}
export declare class MegaEvolutionSystem {
    megaStones: Record<string, MegaStoneConfig>;
    constructor(megaStones?: Record<string, MegaStoneConfig>);
    private validateStatBoosts;
    static fromPokeApi(fetcher: PokemonDataFetcher, seeds?: Record<string, MegaStoneSeed>): Promise<MegaEvolutionSystem>;
    canMegaEvolve(pokemon: Pokemon): boolean;
    megaEvolve(pokemon: Pokemon): boolean;
}
export {};
//# sourceMappingURL=mega-evolution.d.ts.map