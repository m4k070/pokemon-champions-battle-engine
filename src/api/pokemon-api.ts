import { z } from 'zod';

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

// Poke API の応答のうち、このモジュールが読むフィールドだけを検証する。
// 応答を any のまま読むと、形が変わったときに undefined が黙って種族値などへ流れ込む。
const namedResource = z.object({ name: z.string() });

const rawPokemonSchema = z.object({
  id: z.number(),
  name: z.string(),
  stats: z.array(z.object({ base_stat: z.number(), stat: namedResource })),
  types: z.array(z.object({ type: namedResource })),
  abilities: z.array(z.object({ ability: namedResource, is_hidden: z.boolean() })),
  moves: z.array(z.object({ move: namedResource })),
  weight: z.number(),
  height: z.number(),
});

const rawMoveSchema = z.object({
  name: z.string(),
  accuracy: z.number().nullable(),
  power: z.number().nullable(),
  pp: z.number(),
  type: namedResource,
  damage_class: namedResource,
  priority: z.number(),
  meta: z.object({ stat_chance: z.number().nullable() }).nullish(),
});

type RawPokemon = z.infer<typeof rawPokemonSchema>;

const STAT_NAMES = {
  HP: 'hp',
  ATK: 'attack',
  DEF: 'defense',
  SPATK: 'special-attack',
  SPDEF: 'special-defense',
  SPEED: 'speed',
} as const satisfies Record<keyof PokeApiPokemonData['baseStats'], string>;

function baseStat(raw: RawPokemon, statName: string): number {
  const stat = raw.stats.find((s) => s.stat.name === statName);
  if (stat === undefined) {
    throw new Error(`Poke API response for ${raw.name} has no '${statName}' stat`);
  }
  return stat.base_stat;
}

// fetch → ステータス確認 → JSON → スキーマ検証 までを共通化する。
// 形の合わない応答は PokeApiError (status は実際の HTTP ステータス) として投げ、原因を cause に残す。
async function fetchJson<T>(url: string, schema: z.ZodType<T>, what: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new PokeApiError(`Failed to fetch ${what}: ${response.statusText}`, response.status);
  }

  const result = schema.safeParse(await response.json());
  if (!result.success) {
    throw new PokeApiError(`Unexpected response shape for ${what}`, response.status, { cause: result.error });
  }
  return result.data;
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
    const data: unknown = JSON.parse(jsonString);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('PokemonDataCache.fromJSON: expected a JSON object');
    }
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

    const data = await fetchJson(`${POKE_API_BASE}/pokemon/${pokemonId}`, rawPokemonSchema, `Pokemon ${pokemonId}`);

    const formatted: PokeApiPokemonData = {
      id: data.id,
      name: data.name,
      baseStats: {
        HP: baseStat(data, STAT_NAMES.HP),
        ATK: baseStat(data, STAT_NAMES.ATK),
        DEF: baseStat(data, STAT_NAMES.DEF),
        SPATK: baseStat(data, STAT_NAMES.SPATK),
        SPDEF: baseStat(data, STAT_NAMES.SPDEF),
        SPEED: baseStat(data, STAT_NAMES.SPEED),
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

  async fetchMoveData(moveName: string): Promise<PokeApiMoveData> {
    const cacheKey = `move_${moveName}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get<PokeApiMoveData>(cacheKey)!;
    }

    const data = await fetchJson(`${POKE_API_BASE}/move/${moveName}`, rawMoveSchema, `move ${moveName}`);

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
