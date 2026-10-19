import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { cloneStatusState, createStatusState, statusConditionOf, NO_STATUS } from '../src/status-state.js';
import { createMove } from '../src/move.js';
import { isMoveSuccessful } from '../src/use-move-result.js';
import { fixedRandom, scriptedRandom } from './helpers/scripted-random.js';

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

describe('あくび（ねむけ）', () => {
  test('あくびを使われた相手はねむけになり、次のターンの終了時に眠る', () => {
    // Arrange
    const engine = new BattleEngine({ rng: scriptedRandom([0.5]) });
    const attacker = makePokemon();
    const defender = makePokemon();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const yawn = createMove({ name: 'あくび', type: 'normal', category: 'status', inflictsDrowsy: true });

    // Act: あくびを使ったターンの終了では眠らない
    engine.startTurn();
    const result = engine.useMove(attacker, defender, yawn);
    engine.endTurn([attacker], [defender]);

    // Assert
    expect(isMoveSuccessful(result)).toBe(true);
    expect(defender.isDrowsy).toBe(true);
    expect(defender.status).toBeNull();

    // Act: 次のターンの終了で眠る
    engine.startTurn();
    engine.endTurn([attacker], [defender]);

    // Assert
    expect(defender.status).toBe('sleep');
    expect(defender.isDrowsy).toBe(false);
    expect(engine.getLog()).toContain('ねむけの効果で眠ってしまった');
  });

  test('すでに状態異常の相手はねむけにならない', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon();
    const defender = makePokemon();
    defender.applyStatus('burn');
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const yawn = createMove({ name: 'あくび', type: 'normal', category: 'status', inflictsDrowsy: true });

    // Act
    engine.startTurn();
    const result = engine.useMove(attacker, defender, yawn);

    // Assert: 技は出たが効果が無い（'no-effect'）扱いになる
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('status-immune');
    expect(defender.isDrowsy).toBe(false);
    expect(defender.status).toBe('burn');
  });

  test('ねむけは交代で解除される（resetDrowsy）', () => {
    // Arrange
    const pokemon = makePokemon();
    pokemon.applyDrowsy(3);

    // Act
    pokemon.resetDrowsy();

    // Assert
    expect(pokemon.isDrowsy).toBe(false);
    expect(pokemon.drowsyUntilTurn).toBeNull();
  });
});

describe('なまける（自分のHPを最大の1/2回復）', () => {
  test('最大HPの1/2を回復する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon();
    const target = makePokemon();
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    const slackOff = createMove({ name: 'なまける', type: 'normal', category: 'status', selfHealPercent: 0.5 });
    // HPを10まで減らす（回復量が上限に当たらないようにする）
    user.takeDamage(user.maxHP - 10);
    const before = user.currentHP;

    // Act
    const result = engine.useMove(user, target, slackOff);

    // Assert
    expect(isMoveSuccessful(result)).toBe(true);
    expect(before).toBe(10);
    expect(user.currentHP).toBe(before + Math.floor(user.maxHP / 2));
    expect(engine.getLog()).toContain('回復した');
  });

  test('HPが満タンなら回復せず、効果なし（full-hp）として扱う', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon();
    const target = makePokemon();
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    const slackOff = createMove({ name: 'なまける', type: 'normal', category: 'status', selfHealPercent: 0.5 });

    // Act
    const result = engine.useMove(user, target, slackOff);

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('full-hp');
    expect(user.currentHP).toBe(user.maxHP);
  });

  test('回復しても最大HPを超えない', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon();
    const target = makePokemon();
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    const slackOff = createMove({ name: 'なまける', type: 'normal', category: 'status', selfHealPercent: 0.5 });
    user.takeDamage(1);

    // Act
    engine.useMove(user, target, slackOff);

    // Assert
    expect(user.currentHP).toBe(user.maxHP);
  });
});
