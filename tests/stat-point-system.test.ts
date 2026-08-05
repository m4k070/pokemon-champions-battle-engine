import { StatPointSystem, natureMultiplier } from '../src/rules/stat-point-system.js';
import { Pokemon } from '../src/pokemon.js';
import type { BaseStats } from '../src/types.js';

// 種族値（PokeAPI準拠）
const HIPPOWDON: BaseStats = { HP: 108, ATK: 112, DEF: 118, SPATK: 68, SPDEF: 72, SPEED: 47 };
const EXCADRILL: BaseStats = { HP: 110, ATK: 135, DEF: 60, SPATK: 50, SPDEF: 65, SPEED: 88 };

function speedTierBaseStats(baseSpeed: number): BaseStats {
  return { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: baseSpeed };
}

describe('StatPointSystem.calculateStats', () => {
  const system = new StatPointSystem();

  test('1ポイントが実数値1として加算される（本編の努力値式ではない）', () => {
    // Arrange
    const statPoints = { DEF: 32, SPEED: 32 };

    // Act
    const stats = system.calculateStats(HIPPOWDON, statPoints);

    // Assert: 無振りDEF138/SPEED67にそれぞれ+32される
    expect(stats.DEF).toBe(170);
    expect(stats.SPEED).toBe(99);
  });

  test('省略した能力は無振りとして扱われる', () => {
    // Arrange / Act
    const stats = system.calculateStats(HIPPOWDON, { DEF: 32 });

    // Assert
    expect(stats.HP).toBe(183);
    expect(stats.ATK).toBe(132);
    expect(stats.SPEED).toBe(67);
  });

  test('性格補正はポイント加算の後に掛かる', () => {
    // Arrange / Act
    const stats = system.calculateStats(HIPPOWDON, { DEF: 32, SPEED: 32 }, 'わんぱく');

    // Assert: DEF 170*1.1=187、SPATK 88*0.9=79.2→79
    expect(stats.DEF).toBe(187);
    expect(stats.SPATK).toBe(79);
    // 補正外の能力は変わらない
    expect(stats.SPEED).toBe(99);
  });

  test('HPには性格補正が掛からない', () => {
    // Arrange / Act
    const neutral = system.calculateStats(HIPPOWDON, { HP: 32 });
    const boosted = system.calculateStats(HIPPOWDON, { HP: 32 }, 'わんぱく');

    // Assert
    expect(boosted.HP).toBe(neutral.HP);
  });

  test('漢字表記の性格名を受け付ける', () => {
    // Arrange / Act
    const kanji = system.calculateStats(HIPPOWDON, { DEF: 32 }, '腕白');
    const hiragana = system.calculateStats(HIPPOWDON, { DEF: 32 }, 'わんぱく');

    // Assert
    expect(kanji).toEqual(hiragana);
  });

  // 旧JS版の修正時に外部の実構築・素早さ早見表と突き合わせた7ケース。
  // 計算式を変更したらここが最初に落ちる。
  describe('実データとの一致（回帰）', () => {
    test.each([
      // name, baseStats, statPoints, nature, stat, expected
      ['カバルドン HP215 (シーズンM-1 最終51位)', HIPPOWDON, { HP: 32 }, null, 'HP', 215],
      ['カバルドン B154 (同)', HIPPOWDON, { DEF: 2 }, 'わんぱく', 'DEF', 154],
      ['ドリュウズ A205 (同)', EXCADRILL, { ATK: 32 }, 'いじっぱり', 'ATK', 205],
      ['最速100族 167 (M-B 素早さ早見表)', speedTierBaseStats(100), { SPEED: 32 }, 'ようき', 'SPEED', 167],
      ['最速142族 213 (同)', speedTierBaseStats(142), { SPEED: 32 }, 'ようき', 'SPEED', 213],
      ['最速102族 169 (同)', speedTierBaseStats(102), { SPEED: 32 }, 'ようき', 'SPEED', 169],
      ['最速80族 145 (同)', speedTierBaseStats(80), { SPEED: 32 }, 'ようき', 'SPEED', 145],
    ] as const)('%s', (_name, baseStats, statPoints, nature, stat, expected) => {
      // Act
      const stats = system.calculateStats(baseStats, statPoints, nature);

      // Assert
      expect(stats[stat]).toBe(expected);
    });
  });

  describe('上限チェック', () => {
    test('1能力32を超えると例外を投げる', () => {
      expect(() => system.calculateStats(HIPPOWDON, { DEF: 33 })).toThrow('上限を超えています');
    });

    test('合計66を超えると例外を投げる', () => {
      expect(() => system.calculateStats(HIPPOWDON, { HP: 32, DEF: 32, SPDEF: 32 })).toThrow(
        '上限を超えています',
      );
    });
  });
});

describe('natureMultiplier', () => {
  test.each([
    ['わんぱく', 'DEF', 1.1],
    ['わんぱく', 'SPATK', 0.9],
    ['わんぱく', 'ATK', 1.0],
    ['わんぱく', 'HP', 1.0],
  ] as const)('%s の %s は %f 倍', (nature, stat, expected) => {
    expect(natureMultiplier(nature, stat)).toBe(expected);
  });

  test('未知の性格名・null は無補正として扱う', () => {
    expect(natureMultiplier('存在しない性格', 'ATK')).toBe(1.0);
    expect(natureMultiplier(null, 'ATK')).toBe(1.0);
  });
});

describe('Pokemon の実数値', () => {
  test('statPoints / nature を渡すと実数値へ反映される', () => {
    // Arrange / Act
    const pokemon = new Pokemon({
      name: 'hippowdon',
      types: ['ground'],
      ability: 'sand-stream',
      item: null,
      baseStats: HIPPOWDON,
      statPoints: { HP: 32, DEF: 2, SPDEF: 2 },
      nature: 'わんぱく',
    });

    // Assert
    expect(pokemon.stats.HP).toBe(215);
    expect(pokemon.stats.DEF).toBe(154);
    expect(pokemon.maxHP).toBe(215);
    expect(pokemon.currentHP).toBe(215);
  });

  test('statPoints / nature を省略すると無振り・無補正になる（後方互換）', () => {
    // Arrange / Act
    const pokemon = new Pokemon({
      name: 'hippowdon',
      types: ['ground'],
      ability: 'sand-stream',
      item: null,
      baseStats: HIPPOWDON,
    });

    // Assert
    expect(pokemon.stats).toEqual({ HP: 183, ATK: 132, DEF: 138, SPATK: 88, SPDEF: 92, SPEED: 67 });
  });
});
