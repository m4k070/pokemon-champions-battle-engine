import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import {
  PhysicalMove,
  SpecialMove,
  StatusMove,
  cloneDamageMove,
  createMove,
  isDamageMove,
  isPhysicalMove,
  isSpecialMove,
  isStatusMove,
} from '../src/move.js';
import { isMoveSuccessful } from '../src/use-move-result.js';
import { asDamageResult } from './helpers/use-move-result.js';

const NEUTRAL_STATS = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function makePokemon(name: string): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...NEUTRAL_STATS } });
}

describe('createMove: category に応じた技クラスを生成する', () => {
  test('category を省略すると物理技になる', () => {
    // Arrange & Act
    const move = createMove({ name: 'tackle', type: 'normal', power: 40 });

    // Assert
    expect(move).toBeInstanceOf(PhysicalMove);
    expect(move.category).toBe('physical');
  });

  test('category: special で特殊技になる', () => {
    const move = createMove({ name: 'surf', type: 'water', category: 'special', power: 90 });

    expect(move).toBeInstanceOf(SpecialMove);
    expect(move.category).toBe('special');
  });

  test('category: status で変化技になり、威力は常に0になる', () => {
    const move = createMove({ name: 'will-o-wisp', type: 'fire', category: 'status', status: 'burn' });

    expect(move).toBeInstanceOf(StatusMove);
    expect(move.category).toBe('status');
    expect(move.power).toBe(0);
    expect(move.status).toBe('burn');
  });

  test('maxPP を省略すると pp と同じ値になる', () => {
    const move = createMove({ name: 'earthquake', type: 'ground', power: 100, pp: 10 });

    expect(move.maxPP).toBe(10);
  });
});

describe('型ガード: category による絞り込み', () => {
  const physical = createMove({ name: 'earthquake', type: 'ground', power: 100 });
  const special = createMove({ name: 'flamethrower', type: 'fire', category: 'special', power: 90 });
  const status = createMove({ name: 'thunder-wave', type: 'electric', category: 'status', status: 'paralysis' });

  test('isDamageMove は物理技・特殊技にだけ true を返す', () => {
    expect(isDamageMove(physical)).toBe(true);
    expect(isDamageMove(special)).toBe(true);
    expect(isDamageMove(status)).toBe(false);
  });

  test('isStatusMove は変化技にだけ true を返す', () => {
    expect(isStatusMove(status)).toBe(true);
    expect(isStatusMove(physical)).toBe(false);
  });

  test('isPhysicalMove / isSpecialMove はカテゴリを1つだけ通す', () => {
    expect(isPhysicalMove(physical)).toBe(true);
    expect(isPhysicalMove(special)).toBe(false);
    expect(isSpecialMove(special)).toBe(true);
    expect(isSpecialMove(status)).toBe(false);
  });
});

describe('cloneDamageMove: 威力・タイプを差し替えても category を保つ', () => {
  test('物理技を複製しても物理技のまま', () => {
    const original = createMove({ name: 'weather-ball', type: 'normal', power: 50 });

    const cloned = cloneDamageMove(original, { power: 100, type: 'water' });

    expect(cloned.category).toBe('physical');
    expect(cloned.power).toBe(100);
    expect(cloned.type).toBe('water');
    // 元の技は変更されない（イミュータブル）
    expect(original.power).toBe(50);
    expect(original.type).toBe('normal');
  });

  test('特殊技を複製しても特殊技のまま', () => {
    const original = createMove({ name: 'weather-ball', type: 'normal', category: 'special', power: 50 });

    const cloned = cloneDamageMove(original, { power: 100 });

    expect(cloned.category).toBe('special');
    expect(cloned.power).toBe(100);
  });
});

describe('効果フィールドを持たない変化技', () => {
  test('ダメージ計算に進まず、何も起こさずに終わる', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const splash = createMove({ name: 'splash', type: 'normal', category: 'status', pp: 10 });

    // Act
    const result = engine.useMove(attacker, defender, splash);

    // Assert
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'no-applicable-effect' });
    expect(defender.currentHP).toBe(defender.maxHP);
    expect(engine.getLog()).toContain('しかし何も起こらなかった');
  });
});
