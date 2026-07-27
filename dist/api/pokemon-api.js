const POKE_API_BASE = 'https://pokeapi.co/api/v2';
export class PokemonDataCache {
    cache = new Map();
    get(key) {
        return this.cache.get(key);
    }
    set(key, value) {
        this.cache.set(key, value);
    }
    has(key) {
        return this.cache.has(key);
    }
    toJSON() {
        return JSON.stringify(Object.fromEntries(this.cache), null, 2);
    }
    fromJSON(jsonString) {
        const data = JSON.parse(jsonString);
        this.cache = new Map(Object.entries(data));
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
export class PokemonAPI {
    cache;
    constructor(cache = null) {
        this.cache = cache ?? new PokemonDataCache();
    }
    async fetchPokemonData(pokemonId) {
        const cacheKey = `pokemon_${pokemonId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const url = `${POKE_API_BASE}/pokemon/${pokemonId}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Pokemon ${pokemonId}: ${response.statusText}`);
        }
        const data = await response.json();
        const formatted = {
            id: data.id,
            name: data.name,
            baseStats: {
                HP: data.stats.find((s) => s.stat.name === 'hp').base_stat,
                ATK: data.stats.find((s) => s.stat.name === 'attack').base_stat,
                DEF: data.stats.find((s) => s.stat.name === 'defense').base_stat,
                SPATK: data.stats.find((s) => s.stat.name === 'special-attack').base_stat,
                SPDEF: data.stats.find((s) => s.stat.name === 'special-defense').base_stat,
                SPEED: data.stats.find((s) => s.stat.name === 'speed').base_stat,
            },
            types: data.types.map((t) => t.type.name),
            abilities: data.abilities.map((a) => ({
                name: a.ability.name,
                isHidden: a.is_hidden,
            })),
            moves: data.moves.map((m) => m.move.name),
            weight: data.weight,
            height: data.height,
        };
        this.cache.set(cacheKey, formatted);
        return formatted;
    }
    async fetchMoveData(moveName) {
        const cacheKey = `move_${moveName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const url = `${POKE_API_BASE}/move/${moveName}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch move ${moveName}: ${response.statusText}`);
        }
        const data = await response.json();
        const formatted = {
            name: data.name,
            accuracy: data.accuracy,
            power: data.power,
            pp: data.pp,
            type: data.type.name,
            category: data.damage_class.name,
            priority: data.priority,
            effectChance: data.meta?.stat_chance ?? null,
        };
        this.cache.set(cacheKey, formatted);
        return formatted;
    }
}
//# sourceMappingURL=pokemon-api.js.map