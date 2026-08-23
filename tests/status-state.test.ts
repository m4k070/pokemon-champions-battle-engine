import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { cloneStatusState, createStatusState, statusConditionOf, NO_STATUS } from '../src/status-state.js';

function makePokemon(): Pokemon {
  return new Pokemon({
    name: 'Target', types: ['normal'], ability: 'none', item: null,
    baseStats: { HP: 160, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
  });
}

describe('createStatusState: 状態ごとに必要な値だけを持たせる', () => {
  test('ねむりは1〜3ターンの残りターンを持つ', () => {
    // Act
    const state = createStatusState('sleep');

    // Assert
    expect(state.kind).toBe('sleep');
    if (state.kind !== 'sleep') throw new Error('unreachable');
    expect(state.turnsLeft).toBeGreaterThanOrEqual(1);
    expect(state.turnsLeft).toBeLessThanOrEqual(3);
  });

  test('猛毒は経過ターン0から始まる', () => {
    expect(createStatusState('badly-poisoned')).toEqual({ kind: 'badly-poisoned', elapsedTurns: 0 });
  });

  test('付随する値を持たない状態は種類だけを持つ', () => {
    expect(createStatusState('burn')).toEqual({ kind: 'burn' });
    expect(createStatusState('paralysis')).toEqual({ kind: 'paralysis' });
  });
});

describe('statusConditionOf / cloneStatusState', () => {
  test('状態異常なしは null を返す', () => {
    expect(statusConditionOf(NO_STATUS)).toBeNull();
    expect(statusConditionOf({ kind: 'burn' })).toBe('burn');
  });

  test('複製は判別子と付随する値を保ち、元とは別のオブジェクトになる', () => {
    // Arrange
    const original = { kind: 'sleep', turnsLeft: 2 } as const;

    // Act
    const cloned = cloneStatusState(original);

    // Assert
    expect(cloned).toEqual({ kind: 'sleep', turnsLeft: 2 });
    expect(cloned).not.toBe(original);
  });
});

describe('Pokemon の状態異常', () => {
  test('状態異常でなければ status は null', () => {
    const pokemon = makePokemon();

    expect(pokemon.statusState).toEqual({ kind: 'none' });
    expect(pokemon.status).toBeNull();
  });

  test('applyStatus は状態を付与し、status に種類が現れる', () => {
    const pokemon = makePokemon();

    expect(pokemon.applyStatus('burn')).toBe(true);

    expect(pokemon.status).toBe('burn');
    expect(pokemon.statusState).toEqual({ kind: 'burn' });
  });

  test('既に状態異常なら重ねてかからない', () => {
    const pokemon = makePokemon();
    pokemon.applyStatus('burn');

    expect(pokemon.applyStatus('paralysis')).toBe(false);
    expect(pokemon.status).toBe('burn');
  });

  test('removeStatus は付随する値ごと状態を消す', () => {
    const pokemon = makePokemon();
    pokemon.statusState = { kind: 'badly-poisoned', elapsedTurns: 9 };

    pokemon.removeStatus();

    expect(pokemon.statusState).toEqual({ kind: 'none' });
  });

  test('advanceToxicCounter は上限まで経過ターンを進める', () => {
    const pokemon = makePokemon();
    pokemon.statusState = { kind: 'badly-poisoned', elapsedTurns: 14 };

    expect(pokemon.advanceToxicCounter(15)).toBe(15);
    expect(pokemon.advanceToxicCounter(15)).toBe(15);
  });

  test('猛毒でなければ advanceToxicCounter は状態を変えない', () => {
    const pokemon = makePokemon();
    pokemon.applyStatus('poison');

    expect(pokemon.advanceToxicCounter(15)).toBe(0);
    expect(pokemon.statusState).toEqual({ kind: 'poison' });
  });

  test('consumeSleepTurn は残りターンを減らし、0で目を覚ます', () => {
    const pokemon = makePokemon();
    pokemon.statusState = { kind: 'sleep', turnsLeft: 2 };

    expect(pokemon.consumeSleepTurn()).toBe(1);
    expect(pokemon.consumeSleepTurn()).toBe(0);
    expect(pokemon.status).toBeNull();
  });

  test('resetToxicCounter は経過ターンだけを戻し、猛毒状態は維持する', () => {
    const pokemon = makePokemon();
    pokemon.statusState = { kind: 'badly-poisoned', elapsedTurns: 7 };

    pokemon.resetToxicCounter();

    expect(pokemon.statusState).toEqual({ kind: 'badly-poisoned', elapsedTurns: 0 });
  });
});

describe('ターン終了時の状態異常処理', () => {
  test('まひ・こおりはターン終了時にダメージを受けない', () => {
    // Arrange
    const engine = new BattleEngine();
    const paralyzed = makePokemon();
    const frozen = makePokemon();
    paralyzed.applyStatus('paralysis');
    frozen.applyStatus('freeze');

    // Act
    engine.applyStatusEffects([paralyzed, frozen]);

    // Assert
    expect(paralyzed.currentHP).toBe(paralyzed.maxHP);
    expect(frozen.currentHP).toBe(frozen.maxHP);
  });

  test('やけどは最大HPの1/16、どくは1/8のダメージを受ける', () => {
    // Arrange
    const engine = new BattleEngine();
    const burned = makePokemon();
    const poisoned = makePokemon();
    burned.applyStatus('burn');
    poisoned.applyStatus('poison');

    // Act
    engine.applyStatusEffects([burned, poisoned]);

    // Assert
    expect(burned.currentHP).toBe(burned.maxHP - Math.floor(burned.maxHP / 16));
    expect(poisoned.currentHP).toBe(poisoned.maxHP - Math.floor(poisoned.maxHP / 8));
  });
});
