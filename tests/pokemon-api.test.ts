import { PokemonAPI, PokeApiError } from '../src/api/pokemon-api.js';

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    async json() {
      return body;
    },
  } as Response;
}

const GARCHOMP = {
  id: 445,
  name: 'garchomp',
  stats: [
    { base_stat: 108, stat: { name: 'hp' } },
    { base_stat: 130, stat: { name: 'attack' } },
    { base_stat: 95, stat: { name: 'defense' } },
    { base_stat: 80, stat: { name: 'special-attack' } },
    { base_stat: 85, stat: { name: 'special-defense' } },
    { base_stat: 102, stat: { name: 'speed' } },
  ],
  types: [{ type: { name: 'dragon' } }, { type: { name: 'ground' } }],
  abilities: [
    { ability: { name: 'sand-veil' }, is_hidden: false },
    { ability: { name: 'rough-skin' }, is_hidden: true },
  ],
  moves: [{ move: { name: 'earthquake' } }],
  weight: 950,
  height: 19,
};

describe('PokemonAPI', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('ポケモンの応答を種族値・タイプ・特性に変換する', async () => {
    // Arrange
    fetchSpy.mockResolvedValue(mockJsonResponse(GARCHOMP));

    // Act
    const data = await new PokemonAPI().fetchPokemonData('garchomp');

    // Assert
    expect(data.baseStats).toEqual({ HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 });
    expect(data.types).toEqual(['dragon', 'ground']);
    expect(data.abilities).toContainEqual({ name: 'rough-skin', isHidden: true });
  });

  test('形の合わない応答は undefined を流さず PokeApiError にする', async () => {
    // Arrange: base_stat が文字列になっている
    const broken = { ...GARCHOMP, stats: [{ base_stat: '108', stat: { name: 'hp' } }] };
    fetchSpy.mockResolvedValue(mockJsonResponse(broken));

    // Act / Assert
    await expect(new PokemonAPI().fetchPokemonData('garchomp')).rejects.toThrow(PokeApiError);
  });

  test('種族値の項目が欠けていればエラーにする', async () => {
    // Arrange: speed が無い
    const missing = { ...GARCHOMP, stats: GARCHOMP.stats.filter((s) => s.stat.name !== 'speed') };
    fetchSpy.mockResolvedValue(mockJsonResponse(missing));

    // Act / Assert
    await expect(new PokemonAPI().fetchPokemonData('garchomp')).rejects.toThrow("no 'speed' stat");
  });

  test('技の応答を変換し、meta が無ければ追加効果確率を null にする', async () => {
    // Arrange
    fetchSpy.mockResolvedValue(
      mockJsonResponse({
        name: 'earthquake',
        accuracy: 100,
        power: 100,
        pp: 10,
        type: { name: 'ground' },
        damage_class: { name: 'physical' },
        priority: 0,
        meta: null,
      })
    );

    // Act
    const move = await new PokemonAPI().fetchMoveData('earthquake');

    // Assert
    expect(move).toEqual({
      name: 'earthquake',
      accuracy: 100,
      power: 100,
      pp: 10,
      type: 'ground',
      category: 'physical',
      priority: 0,
      effectChance: null,
    });
  });

  test('404 は isNotFound の PokeApiError になる', async () => {
    // Arrange
    fetchSpy.mockResolvedValue(mockJsonResponse({}, 404));

    // Act
    const error: unknown = await new PokemonAPI().fetchMoveData('no-such-move').catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(PokeApiError);
    expect((error as PokeApiError).isNotFound).toBe(true);
  });
});
