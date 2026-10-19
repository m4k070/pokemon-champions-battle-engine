import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import { asDamageResult } from './helpers/use-move-result.js';

// 能力ランク（StatStage）を扱う技の検証。
// ダメージの揺れ（T0）があるため、ダメージを比較する場合は乱数を固定する。
function makePokemon(overrides: Partial<{ name: string; types: ('normal' | 'ghost')[]; speed: number; atk: number; def: number }> = {}): Pokemon {
  return new Pokemon({
    name: overrides.name ?? 'Target',
    types: overrides.types ?? ['normal'],
    ability: 'none',
    item: null,
    baseStats: {
      HP: 160,
      ATK: overrides.atk ?? 100,
      DEF: overrides.def ?? 100,
      SPATK: 100,
      SPDEF: 100,
      SPEED: overrides.speed ?? 100,
    },
  });
}

describe('こわいかお（相手のすばやさを2段階下げる）', () => {
  const scaryFace = () => createMove({
    name: 'こわいかお', type: 'normal', category: 'status',
    targetStatChange: [{ stat: 'SPEED', delta: -2, chance: 100 }],
  });

  test('相手のすばやさランクが2段階下がり、実効速度が下がる', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const target = makePokemon({ name: 'Target' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    const speedBefore = engine.calculateSpeed(target);

    // Act
    const result = engine.useMove(user, target, scaryFace());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(target.statStages.SPEED).toBe(-2);
    // -2段階の倍率は 2/(2-(-2)) = 0.5
    expect(engine.calculateSpeed(target)).toBe(Math.floor(speedBefore * 0.5));
  });

  test('すばやさランクは下限（-6）で止まる', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const target = makePokemon({ name: 'Target' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);

    // Act: -2 × 3回 = -6（下限）
    engine.useMove(user, target, scaryFace());
    engine.useMove(user, target, scaryFace());
    engine.useMove(user, target, scaryFace());
    engine.useMove(user, target, scaryFace());

    // Assert
    expect(target.statStages.SPEED).toBe(-6);
  });

  test('ノーマルの変化技なのでゴーストタイプには効かない（タイプ相性の規約）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const ghost = makePokemon({ name: 'Gengar', types: ['ghost'] });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, ghost);

    // Act
    const result = engine.useMove(user, ghost, scaryFace());

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('type-immune');
    expect(ghost.statStages.SPEED).toBe(0);
  });

  test('能力ランクは交代でリセットされる', () => {
    // Arrange
    const target = makePokemon();
    target.modifyStatStage('SPEED', -2);

    // Act
    target.resetStatStages();

    // Assert
    expect(target.statStages.SPEED).toBe(0);
  });
});
