import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import type { Move } from '../src/move.js';
import { seededRandom } from '../src/rng.js';
import { scriptedRandom, fixedRandom } from './helpers/scripted-random.js';
import { asDamageResult } from './helpers/use-move-result.js';

// どちらもノーマルタイプなので、みず技にタイプ一致補正は乗らない（倍率を1倍に保つ）。
// 持ち物・特性の補正も無し。ダメージは「基礎ダメージ × タイプ相性1 × 急所 × 乱数」だけで決まる。
function makeAttacker(): Pokemon {
  return new Pokemon({
    name: 'Attacker', types: ['normal'], ability: 'none', item: null,
    baseStats: { HP: 100, ATK: 120, DEF: 100, SPATK: 120, SPDEF: 100, SPEED: 100 },
  });
}

function makeDefender(): Pokemon {
  return new Pokemon({
    name: 'Defender', types: ['normal'], ability: 'none', item: null,
    baseStats: { HP: 200, ATK: 80, DEF: 120, SPATK: 80, SPDEF: 120, SPEED: 50 },
  });
}

const probeMove = (): Move => createMove({ name: 'probe', type: 'water', power: 80, accuracy: 100, pp: 10 });

// 乱数・急所を除いた「補正後のダメージ」。乱数は最後に1回だけ掛かるので、
// 期待値はここから計算できる（テスト側で式を二重実装しないための入口）。
function deterministicDamage(engine: BattleEngine, attacker: Pokemon, defender: Pokemon, move: Move): number {
  const attack = engine.calculateAttack(attacker, move);
  const defense = engine.calculateDefense(defender, move);
  const baseDamage = engine.calculateBaseDamage(attack, defense, move);
  const { finalDamage } = engine.applyModifiers(baseDamage, attacker, defender, move);
  return finalDamage;
}

function runOnce(rngSeedOrValues: number | number[]): { damage: number; log: string[] } {
  const rng = typeof rngSeedOrValues === 'number'
    ? seededRandom(rngSeedOrValues)
    : scriptedRandom(rngSeedOrValues);
  const engine = new BattleEngine({ rng });
  const attacker = makeAttacker();
  const defender = makeDefender();
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);

  const result = engine.useMove(attacker, defender, probeMove());
  return { damage: asDamageResult(result).damage, log: engine.log };
}

describe('ダメージの揺れ（0.85〜1.00の16段階）', () => {
  test('rollDamageFactor は16段階のいずれかを返す', () => {
    // Arrange
    const engine = new BattleEngine({ rng: seededRandom(2026) });
    const seen = new Set<number>();

    // Act
    for (let i = 0; i < 500; i++) {
      seen.add(engine.rollDamageFactor());
    }

    // Assert: 0.85〜1.00 を 0.01 刻みで16通り。500回引けば全段階が出る。
    expect([...seen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => (85 + i) / 100),
    );
  });

  test('最小乱数(0.85)と最大乱数(1.00)が期待どおりのダメージになる', () => {
    // Arrange: 1回目が急所判定(0.5=急所に当たらない)、2回目が乱数。
    const engine = new BattleEngine({ rng: fixedRandom(0) });
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const expected = deterministicDamage(engine, attacker, defender, probeMove());
    expect(expected).toBeGreaterThan(1);

    // Act
    const min = runOnce([0.5, 0]).damage;        // 乱数 0.85
    const max = runOnce([0.5, 0.9999]).damage;   // 乱数 1.00

    // Assert
    expect(min).toBe(Math.floor(expected * 0.85));
    expect(max).toBe(expected);
  });

  test('同じ seed なら同じダメージ列になる（再現可能性）', () => {
    // Act
    const first = Array.from({ length: 20 }, (_, i) => runOnce(i + 1).damage);
    const second = Array.from({ length: 20 }, (_, i) => runOnce(i + 1).damage);

    // Assert
    expect(first).toEqual(second);
    // 揺れていること自体の確認（全部同じ値なら乱数が掛かっていない）
    expect(new Set(first).size).toBeGreaterThan(1);
  });

  test('タイプ相性が0倍でなければ、乱数で0になっても最低1ダメージ残る', () => {
    const engine = new BattleEngine({ rng: scriptedRandom([0]) });

    expect(engine.rollDamage(1, 1)).toBe(1);  // floor(1 * 0.85) = 0 → 1
    expect(engine.rollDamage(0, 1)).toBe(0);  // そもそもダメージが無い技
  });

  test('多段技はヒットごとに乱数を引く', () => {
    // Arrange: 1回目はヒット数、以降は「急所判定・乱数」の繰り返し。
    const move = createMove({ name: 'rock-blast', type: 'water', power: 25, accuracy: 100, pp: 10, multiHit: true });
    const highRolls = runMultiHit([0.5, 0.5, 0.9999, 0.5, 0.9999, 0.5, 0.9999], move);
    const lowRolls = runMultiHit([0.5, 0.5, 0, 0.5, 0, 0.5, 0], move);

    // Assert: 5発（0.875以上）ではなく3発で、乱数が高い方が大きい
    expect(highRolls.damage).toBeGreaterThan(lowRolls.damage);
    expect(highRolls.damage).toBeLessThan(5 * lowRolls.damage);
  });
});

function runMultiHit(values: number[], move: Move): { damage: number; log: string[] } {
  const engine = new BattleEngine({ rng: scriptedRandom(values) });
  const attacker = makeAttacker();
  const defender = makeDefender();
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);
  const result = engine.useMove(attacker, defender, move);
  return { damage: asDamageResult(result).damage, log: engine.log };
}

describe('急所', () => {
  test('急所はダメージを1.5倍にする', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0) });
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const expected = deterministicDamage(engine, attacker, defender, probeMove());

    // Act: 1回目 0（1/24未満=急所）、2回目 0.9999（乱数1.00）
    const { damage, log } = runOnce([0, 0.9999]);

    // Assert
    expect(damage).toBe(Math.floor(expected * 1.5));
    expect(log).toContain('急所に当たった！');
  });

  test('急所率は1/24（0.0417未満で急所、以上で通常）', () => {
    expect(runOnce([0.04, 0.9999]).damage).toBeGreaterThan(runOnce([0.05, 0.9999]).damage);
  });

  test('急所はリフレクターを貫通する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0) });
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    // 壁を張る前の補正後ダメージを基準にする（壁ぶんの差をここで測る）。
    const baseDamage = deterministicDamage(engine, attacker, defender, probeMove());
    engine.field.reflect.playerB = 5;

    // Act
    const critical = runOnceWithReflect([0, 0.9999]);
    const normal = runOnceWithReflect([0.5, 0.9999]);

    // Assert
    expect(normal).toBe(Math.floor(baseDamage / 2));
    expect(critical).toBe(Math.floor(baseDamage * 1.5));
  });

  function runOnceWithReflect(values: number[]): number {
    const engine = new BattleEngine({ rng: scriptedRandom(values) });
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    engine.field.reflect.playerB = 5;
    return asDamageResult(engine.useMove(attacker, defender, probeMove())).damage;
  }

  test('急所は攻撃側のマイナスランクを無視する', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    attacker.statStages.ATK = -2;
    const move = probeMove();

    // Act / Assert
    expect(engine.calculateAttack(attacker, move, { critical: true })).toBe(attacker.stats.ATK);
    expect(engine.calculateAttack(attacker, move)).toBe(Math.floor(attacker.stats.ATK / 2));
  });

  test('急所は防御側のプラスランクを無視する', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    defender.statStages.DEF = 2;
    const move = probeMove();

    // Act / Assert
    expect(engine.calculateDefense(defender, move, { critical: true })).toBe(defender.stats.DEF);
    expect(engine.calculateDefense(defender, move)).toBe(Math.floor(defender.stats.DEF * 2));
  });

  test('シェルアーマー持ちには急所が発生しない', () => {
    // Arrange: 常に急所になる乱数（0）でも、シェルアーマーなら急所にならない。
    const engine = new BattleEngine({ rng: fixedRandom(0) });
    const attacker = makeAttacker();
    const defender = makeDefender();
    defender.ability = 'shell-armor';
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);

    // Act
    expect(engine.rollCriticalHit(defender)).toBe(false);

    // Assert: 乱数を1回も引かずに判定を終える
    const rng = scriptedRandom([0]);
    const probe = new BattleEngine({ rng });
    probe.setActivePokemon(0, attacker);
    probe.setActivePokemon(1, defender);
    probe.rollCriticalHit(defender);
    expect(rng.calls()).toBe(0);
  });
});
