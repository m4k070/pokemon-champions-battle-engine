const POKE_API_BASE = 'https://pokeapi.co/api/v2';

// Poke API がエラー応答を返したことを、HTTPステータス付きで伝える。
// 「存在しないリソース(404)」と「一時的な障害」を呼び出し側が区別できるようにする。
export class PokeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'PokeApiError';
  }

  // 照会したリソースが存在しない（技名・ポケモン名が間違っている等）。
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

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
  abilities: { name: string; isHidden: boolean }[];
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

export class PokemonDataCache {
  private cache = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  toJSON(): string {
    return JSON.stringify(Object.fromEntries(this.cache), null, 2);
  }

  fromJSON(jsonString: string): void {
    const data = JSON.parse(jsonString);
    this.cache = new Map(Object.entries(data));
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export class PokemonAPI {
  cache: PokemonDataCache;

  constructor(cache: PokemonDataCache | null = null) {
    this.cache = cache ?? new PokemonDataCache();
  }

  async fetchPokemonData(pokemonId: string | number): Promise<PokeApiPokemonData> {
    const cacheKey = `pokemon_${pokemonId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get<PokeApiPokemonData>(cacheKey)!;
    }

    const url = `${POKE_API_BASE}/pokemon/${pokemonId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new PokeApiError(`Failed to fetch Pokemon ${pokemonId}: ${response.statusText}`, response.status);
    }

    const data = await response.json() as any;

    const formatted: PokeApiPokemonData = {
      id: data.id,
      name: data.name,
      baseStats: {
        HP: data.stats.find((s: any) => s.stat.name === 'hp').base_stat,
        ATK: data.stats.find((s: any) => s.stat.name === 'attack').base_stat,
        DEF: data.stats.find((s: any) => s.stat.name === 'defense').base_stat,
        SPATK: data.stats.find((s: any) => s.stat.name === 'special-attack').base_stat,
        SPDEF: data.stats.find((s: any) => s.stat.name === 'special-defense').base_stat,
        SPEED: data.stats.find((s: any) => s.stat.name === 'speed').base_stat,
      },
      types: data.types.map((t: any) => t.type.name),
      abilities: data.abilities.map((a: any) => ({
        name: a.ability.name,
        isHidden: a.is_hidden,
      })),
      moves: data.moves.map((m: any) => m.move.name),
      weight: data.weight,
      height: data.height,
    };

    this.cache.set(cacheKey, formatted);

    return formatted;
  }

  async fetchMoveData(moveName: string): Promise<PokeApiMoveData> {
    const cacheKey = `move_${moveName}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get<PokeApiMoveData>(cacheKey)!;
    }

    const url = `${POKE_API_BASE}/move/${moveName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new PokeApiError(`Failed to fetch move ${moveName}: ${response.statusText}`, response.status);
    }

    const data = await response.json() as any;

    const formatted: PokeApiMoveData = {
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
