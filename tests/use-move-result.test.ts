import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { isDamageResult, isMoveSuccessful, shouldPivotAfterMove } from '../src/use-move-result.js';

const NEUTRAL_STATS = { HP: 120, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function makePokemon(name: string, overrides: Partial<{ types: ['normal'] | ['ghost']; ability: 'none' | 'bulletproof' }> = {}): Pokemon {
  return new Pokemon({
    name,
    types: overrides.types ?? ['normal'],
    ability: overrides.ability ?? 'none',
    item: null,
    baseStats: { ...NEUTRAL_STATS },
  });
}

const tackle = () => createMove({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10 });

describe('技が出せなかったとき: 理由が型で返る', () => {
  test('PPが残っていなければ no-pp', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const move = createMove({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 0 });

    // Act
    const result = engine.useMove(attacker, defender, move);

    // Assert
    expect(result).toEqual({ outcome: 'failed', reason: 'no-pp' });
    expect(isMoveSuccessful(result)).toBe(false);
  });

  test('ねむり中は asleep', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    attacker.statusState = { kind: 'sleep', turnsLeft: 2 };

    const result = engine.useMove(attacker, defender, tackle());

    expect(result).toEqual({ outcome: 'failed', reason: 'asleep' });
  });

  test('ちょうはつ中に攻撃技を使うと taunted', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    attacker.applyTaunt(3);

    const result = engine.useMove(attacker, defender, tackle());

    expect(result).toEqual({ outcome: 'failed', reason: 'taunted' });
  });

  test('相手の特性に無効化されると blocked-by-ability', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender', { ability: 'bulletproof' });
    const shadowBall = createMove({ name: 'shadow-ball', type: 'ghost', category: 'special', power: 80, accuracy: 100, pp: 10 });

    const result = engine.useMove(attacker, defender, shadowBall);

    expect(result).toEqual({ outcome: 'failed', reason: 'blocked-by-ability' });
  });

  test('命中判定に失敗すると missed', () => {
    // Arrange: 命中率0の技で必ず外れさせる
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const alwaysMiss = createMove({ name: 'always-miss', type: 'normal', power: 40, accuracy: 0, pp: 10 });

    // Act
    const result = engine.useMove(attacker, defender, alwaysMiss);

    // Assert
    expect(result).toEqual({ outcome: 'failed', reason: 'missed' });
    expect(shouldPivotAfterMove(result)).toBe(false);
  });
});

describe('技が成立したとき: 何が起きたかで結果が分かれる', () => {
  test('ダメージを与えると damaged', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');

    // Act
    const result = engine.useMove(attacker, defender, tackle());

    // Assert
    expect(isDamageResult(result)).toBe(true);
    if (!isDamageResult(result)) throw new Error('unreachable');
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).toBe(1);
    expect(result.pivot).toBe(false);
  });

  test('タイプ相性が0倍なら no-effect(type-immune)', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const ghost = makePokemon('Gengar', { types: ['ghost'] });

    const result = engine.useMove(attacker, ghost, tackle());

    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
    // 技そのものは出ているため失敗ではない
    expect(isMoveSuccessful(result)).toBe(true);
  });

  test('状態異常を与えると status-inflicted', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const willOWisp = createMove({ name: 'will-o-wisp', type: 'fire', category: 'status', accuracy: 100, pp: 15, status: 'burn' });

    const result = engine.useMove(attacker, defender, willOWisp);

    expect(result).toEqual({ outcome: 'status-inflicted', status: 'burn', pivot: false });
  });

  test('既に状態異常なら no-effect(status-immune)', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    defender.applyStatus('paralysis');
    const willOWisp = createMove({ name: 'will-o-wisp', type: 'fire', category: 'status', accuracy: 100, pp: 15, status: 'burn' });

    // Act
    const result = engine.useMove(attacker, defender, willOWisp);

    // Assert: 状態異常を与えられなかったことが結果の型に現れる
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'status-immune' });
  });

  test('天候などの効果が発動すると effect-applied', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const rainDance = createMove({ name: 'rain-dance', type: 'water', category: 'status', accuracy: 100, pp: 5, weather: 'rain' });

    const result = engine.useMove(attacker, defender, rainDance);

    expect(result).toEqual({ outcome: 'effect-applied', pivot: false });
    expect(engine.weather).toBe('rain');
  });

  test('pivot技が成立すると交代すべきと判定される', () => {
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const uTurn = createMove({ name: 'u-turn', type: 'bug', power: 70, accuracy: 100, pp: 10, pivot: true });

    const result = engine.useMove(attacker, defender, uTurn);

    expect(shouldPivotAfterMove(result)).toBe(true);
  });
});
