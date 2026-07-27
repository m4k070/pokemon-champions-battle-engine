export interface PokeApiPokemonData {
    id: number;
    name: string;
    baseStats: {
        HP: number;
        ATK: number;
        DEF: number;
        SPATK: number;
        SPDEF: number;
        SPEED: number;
    };
    types: string[];
    abilities: {
        name: string;
        isHidden: boolean;
    }[];
    moves: string[];
    weight: number;
    height: number;
}
export interface PokeApiMoveData {
    name: string;
    accuracy: number | null;
    power: number | null;
    pp: number;
    type: string;
    category: string;
    priority: number;
    effectChance: number | null;
}
export declare class PokemonDataCache {
    private cache;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    toJSON(): string;
    fromJSON(jsonString: string): void;
    clear(): void;
    size(): number;
}
export declare class PokemonAPI {
    cache: PokemonDataCache;
    constructor(cache?: PokemonDataCache | null);
    fetchPokemonData(pokemonId: string | number): Promise<PokeApiPokemonData>;
    fetchMoveData(moveName: string): Promise<PokeApiMoveData>;
}
//# sourceMappingURL=pokemon-api.d.ts.map