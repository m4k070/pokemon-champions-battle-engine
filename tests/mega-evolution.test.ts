import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';
import type { PokemonDataFetcher, MegaStoneSeed } from '../src/rules/mega-evolution.js';
import type { PokeApiPokemonData } from '../src/api/pokemon-api.js';
import { Pokemon } from '../src/pokemon.js';

function fakePokemonData(overrides: Partial<PokeApiPokemonData>): PokeApiPokemonData {
  return {
    id: 0,
    name: 'dummy',
    baseStats: { HP: 0, ATK: 0, DEF: 0, SPATK: 0, SPDEF: 0, SPEED: 0 },
    types: [],
    abilities: [],
    moves: [],
    weight: 0,
    height: 0,
    ...overrides,
  };
}

// Poke API実データ(2026-07時点でcurlにて確認済み)を模したモック。ネットワークには依存しない。
function createMockFetcher(): PokemonDataFetcher {
  const byName: Record<string, PokeApiPokemonData> = {
    charizard: fakePokemonData({
      name: 'charizard',
      types: ['fire', 'flying'],
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
    }),
    'charizard-mega-x': fakePokemonData({
      name: 'charizard-mega-x',
      types: ['fire', 'dragon'],
      abilities: [{ name: 'tough-claws', isHidden: false }],
      baseStats: { HP: 78, ATK: 130, DEF: 111, SPATK: 130, SPDEF: 85, SPEED: 100 },
    }),
    'charizard-mega-y': fakePokemonData({
      name: 'charizard-mega-y',
      types: ['fire', 'flying'],
      abilities: [{ name: 'drought', isHidden: false }],
      baseStats: { HP: 78, ATK: 104, DEF: 78, SPATK: 159, SPDEF: 115, SPEED: 100 },
    }),
    garchomp: fakePokemonData({
      name: 'garchomp',
      types: ['dragon', 'ground'],
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    }),
    'garchomp-mega': fakePokemonData({
      name: 'garchomp-mega',
      types: ['dragon', 'ground'],
      abilities: [{ name: 'sand-force', isHidden: false }],
      baseStats: { HP: 108, ATK: 170, DEF: 115, SPATK: 120, SPDEF: 95, SPEED: 92 },
    }),
  };

  return {
    async fetchPokemonData(pokemonId) {
      const data = byName[String(pokemonId)];
      if (!data) throw new Error(`unknown mock pokemon: ${pokemonId}`);
      return data;
    },
  };
}

describe('MegaEvolutionSystem', () => {
  test('all registered mega stones distribute exactly +100 base stat total', () => {
    const system = new MegaEvolutionSystem();

    for (const [item, stone] of Object.entries(system.megaStones)) {
      const total = stone.statBoosts.ATK + stone.statBoosts.DEF + stone.statBoosts.SPATK
        + stone.statBoosts.SPDEF + stone.statBoosts.SPEED;
      expect(total).toBe(100);
      expect(item).toBeTruthy();
    }
  });

  test('Mega Charizard X applies its own ATK/DEF/SPATK distribution, not a flat +100', () => {
    const system = new MegaEvolutionSystem();
    const charizard = new Pokemon({
      name: 'charizard',
      baseName: 'charizard',
      types: ['fire', 'flying'],
      ability: 'blaze',
      item: 'charizardite-x',
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
    });

    const hpBefore = charizard.stats.HP;
    const atkBefore = charizard.stats.ATK;
    const defBefore = charizard.stats.DEF;
    const spatkBefore = charizard.stats.SPATK;
    const spdefBefore = charizard.stats.SPDEF;
    const speedBefore = charizard.stats.SPEED;

    system.megaEvolve(charizard);

    expect(charizard.stats.HP).toBe(hpBefore); // HPは変化しない
    expect(charizard.stats.ATK).toBe(atkBefore + 46); // メガXの配分: ATK+46
    expect(charizard.stats.DEF).toBe(defBefore + 33); // メガXの配分: DEF+33
    expect(charizard.stats.SPATK).toBe(spatkBefore + 21); // メガXの配分: SPATK+21
    expect(charizard.stats.SPDEF).toBe(spdefBefore); // メガXはSPDEF±0
    expect(charizard.stats.SPEED).toBe(speedBefore); // メガXはSPEED±0
    expect(charizard.types).toEqual(['fire', 'dragon']);
  });

  test('Mega Garchomp actually loses Speed (well-known -10 quirk)', () => {
    const system = new MegaEvolutionSystem();
    const garchomp = new Pokemon({
      name: 'garchomp',
      baseName: 'garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: 'garchompite',
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    });

    const speedBefore = garchomp.stats.SPEED;
    system.megaEvolve(garchomp);

    expect(garchomp.stats.SPEED).toBeLessThan(speedBefore);
    expect(garchomp.baseStats.SPEED).toBe(102 - 10);
  });

  test('性格補正持ちは上昇後の種族値から再計算される（補正後に加算しない）', () => {
    const system = new MegaEvolutionSystem();
    const charizard = new Pokemon({
      name: 'charizard',
      baseName: 'charizard',
      types: ['fire', 'flying'],
      ability: 'blaze',
      item: 'charizardite-x',
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
      statPoints: { ATK: 32, SPEED: 32 },
      nature: 'いじっぱり',
    });

    // メガ前: 補正前 84+20+32=136 → floor(136*1.1)=149
    expect(charizard.stats.ATK).toBe(149);

    system.megaEvolve(charizard);

    // メガ後: 補正前 (84+46)+20+32=182 → floor(182*1.1)=200
    // 補正後に加算していると 149+46=195 になり、5ずれる。
    expect(charizard.stats.ATK).toBe(200);
  });

  test('mega evolution never changes HP', () => {
    const system = new MegaEvolutionSystem();
    const garchomp = new Pokemon({
      name: 'garchomp',
      baseName: 'garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: 'garchompite',
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      currentHP: 50,
    });

    system.megaEvolve(garchomp);

    expect(garchomp.maxHP).toBe(garchomp.stats.HP);
    expect(garchomp.currentHP).toBe(50);
    expect(garchomp.baseStats.HP).toBe(108);
  });
});

describe('MegaEvolutionSystem.fromPokeApi', () => {
  test('derives statBoosts/typeChange/abilityChange from base vs. mega form stats', async () => {
    const system = await MegaEvolutionSystem.fromPokeApi(createMockFetcher());

    expect(system.megaStones['charizardite-x']).toEqual({
      pokemon: 'charizard',
      megaName: 'mega-charizard-x',
      typeChange: ['fire', 'dragon'],
      abilityChange: 'tough-claws',
      statBoosts: { ATK: 46, DEF: 33, SPATK: 21, SPDEF: 0, SPEED: 0 },
    });

    expect(system.megaStones['garchompite']).toEqual({
      pokemon: 'garchomp',
      megaName: 'mega-garchomp',
      typeChange: ['dragon', 'ground'],
      abilityChange: 'sand-force',
      statBoosts: { ATK: 40, DEF: 20, SPATK: 40, SPDEF: 10, SPEED: -10 },
    });
  });

  test('only fetches the seeds it is given, not the whole default table', async () => {
    const fetcher = createMockFetcher();
    const seeds: Record<string, MegaStoneSeed> = {
      'charizardite-x': { pokemon: 'charizard', megaApiName: 'charizard-mega-x', megaName: 'mega-charizard-x' },
    };

    const system = await MegaEvolutionSystem.fromPokeApi(fetcher, seeds);

    expect(Object.keys(system.megaStones)).toEqual(['charizardite-x']);
  });

  test('throws if the API data implies HP changed on mega evolution', async () => {
    const fetcher: PokemonDataFetcher = {
      async fetchPokemonData(id) {
        if (id === 'charizard') {
          return fakePokemonData({ baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 } });
        }
        // 壊れたAPIレスポンスを模してHPが変化しているケース
        return fakePokemonData({ baseStats: { HP: 99, ATK: 130, DEF: 111, SPATK: 130, SPDEF: 85, SPEED: 100 } });
      },
    };
    const seeds: Record<string, MegaStoneSeed> = {
      'charizardite-x': { pokemon: 'charizard', megaApiName: 'charizard-mega-x', megaName: 'mega-charizard-x' },
    };

    await expect(MegaEvolutionSystem.fromPokeApi(fetcher, seeds)).rejects.toThrow('HPが変化する');
  });

  test('throws if the derived stat boosts do not sum to 100', async () => {
    const fetcher: PokemonDataFetcher = {
      async fetchPokemonData(id) {
        if (id === 'charizard') {
          return fakePokemonData({ baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 } });
        }
        // ATK+46のみで他が変化しない、合計100にならない壊れたレスポンス
        return fakePokemonData({ baseStats: { HP: 78, ATK: 130, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 } });
      },
    };
    const seeds: Record<string, MegaStoneSeed> = {
      'charizardite-x': { pokemon: 'charizard', megaApiName: 'charizard-mega-x', megaName: 'mega-charizard-x' },
    };

    await expect(MegaEvolutionSystem.fromPokeApi(fetcher, seeds)).rejects.toThrow('種族値配分が不正');
  });
});
