import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// まもる・ねむる・反動。いずれも現環境の構築で頻出する。
function makePokemon(params: {
  name?: string;
  types?: TypeName[];
  ability?: AbilityName;
  item?: ItemName | null;
  baseHP?: number;
} = {}): Pokemon {
  return new Pokemon({
    name: params.name ?? 'Mon',
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: params.item ?? null,
    baseStats: { HP: params.baseHP ?? 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
  });
}

const protect = () => createMove({ name: 'まもる', type: 'normal', category: 'status', protects: true });
const rest = () => createMove({ name: 'ねむる', type: 'psychic', category: 'status', rests: true });
const swordsDance = () => createMove({
  name: 'つるぎのまい', type: 'normal', category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }],
});
const tackle = () => createMove({ name: 'Tackle', type: 'normal', power: 60, accuracy: 100, category: 'physical' });
const waveCrash = () => createMove({
  name: 'ウェーブタックル', type: 'water', power: 120, accuracy: 100, category: 'physical', recoilPercent: 1 / 3,
});
const steelBeam = () => createMove({
  name: 'てっていこうせん', type: 'steel', power: 140, accuracy: 95, category: 'special', recoilMaxHpPercent: 0.5,
});

describe('まもる', () => {
  test('相手の技を無効化し、自分の積み技は妨げない', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const guard = makePokemon({ name: 'Guard' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, guard);
    engine.setActivePokemon(1, foe);

    // Act
    const guarded = engine.useMove(guard, foe, protect());
    const blocked = engine.useMove(foe, guard, tackle());

    // Assert
    expect(guarded.outcome).toBe('effect-applied');
    expect(guard.protecting).toBe(true);
    expect(blocked.outcome).toBe('failed');
    if (blocked.outcome !== 'failed') throw new Error('unreachable');
    expect(blocked.reason).toBe('protected');
    expect(guard.currentHP).toBe(guard.maxHP);

    // 自分を対象にする技は防げない
    const selfBuff = engine.useMove(guard, foe, swordsDance());
    expect(selfBuff.outcome).toBe('effect-applied');
    expect(guard.statStages.ATK).toBe(2);
  });

  test('防護はターンが変わると解ける', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const guard = makePokemon({ name: 'Guard' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, guard);
    engine.setActivePokemon(1, foe);
    engine.useMove(guard, foe, protect());

    // Act
    engine.startTurn();
    const hit = engine.useMove(foe, guard, tackle());

    // Assert
    expect(guard.protecting).toBe(false);
    expect(hit.outcome).toBe('damaged');
    expect(guard.currentHP).toBeLessThan(guard.maxHP);
  });

  test('連続で使うと成功率が半減する（2回目は失敗）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) }); // 常に0.5を引く
    const guard = makePokemon({ name: 'Guard' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, guard);
    engine.setActivePokemon(1, foe);

    // Act
    const first = engine.useMove(guard, foe, protect());   // 成功率1.0 → 0.5 < 1.0 で成功
    const second = engine.useMove(guard, foe, protect());  // 成功率0.5 → 0.5 >= 0.5 で失敗

    // Assert
    expect(first.outcome).toBe('effect-applied');
    expect(second.outcome).toBe('failed');
    if (second.outcome !== 'failed') throw new Error('unreachable');
    expect(second.reason).toBe('protect-failed');
    expect(guard.protectStreak).toBe(0);
  });

  test('別の技を出すと連続使用のカウントが切れる', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const guard = makePokemon({ name: 'Guard' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, guard);
    engine.setActivePokemon(1, foe);
    engine.useMove(guard, foe, protect());
    expect(guard.protectStreak).toBe(1);

    // Act
    engine.useMove(guard, foe, swordsDance());

    // Assert
    expect(guard.protectStreak).toBe(0);
  });
});

describe('ねむる', () => {
  test('HPを全回復して2ターン眠る', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    user.currentHP = 10;

    // Act
    const result = engine.useMove(user, foe, rest());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(user.currentHP).toBe(user.maxHP);
    expect(user.statusState.kind).toBe('sleep');
    if (user.statusState.kind !== 'sleep') throw new Error('unreachable');
    expect(user.statusState.turnsLeft).toBe(2);
  });

  test('HPが満タンなら失敗する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);

    // Act
    const result = engine.useMove(user, foe, rest());

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('full-hp');
    expect(user.statusState.kind).toBe('none');
  });

  test('既に状態異常があると眠れない', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    user.currentHP = 50;
    user.applyStatus('paralysis');

    // Act
    const result = engine.useMove(user, foe, rest());

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('status-immune');
    expect(user.currentHP).toBe(50); // 回復しない
    expect(user.statusState.kind).toBe('paralysis');
  });
});

describe('反動技', () => {
  test('与えたダメージの1/3を自分も受ける', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const hpBefore = attacker.currentHP;

    // Act
    const result = engine.useMove(attacker, defender, waveCrash());

    // Assert
    if (result.outcome !== 'damaged') throw new Error(`damaged を期待: ${result.outcome}`);
    expect(attacker.currentHP).toBe(hpBefore - Math.floor(result.damage / 3));
    expect(engine.getLog()).toContain('反動で');
  });

  test('最大HPの1/2を自分も受ける（てっていこうせん）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);

    // Act
    engine.useMove(attacker, defender, steelBeam());

    // Assert
    expect(attacker.currentHP).toBe(attacker.maxHP - Math.floor(attacker.maxHP / 2));
  });

  test('反動で倒れると戦闘不能になる', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    attacker.currentHP = 10; // 反動（最大HPの半分）で倒れる

    // Act
    engine.useMove(attacker, defender, steelBeam());

    // Assert
    expect(attacker.isFainted).toBe(true);
    expect(engine.getLog()).toContain('Attackerは戦闘不能になった');
  });
});
