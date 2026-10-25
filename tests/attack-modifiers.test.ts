import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// 攻撃側の計算に関わる技。現環境の構築で頻出する。
//   ふいうち / イカサマ / くさむすび / はたきおとす / ポルターガイスト / ダメおし / トリックフラワー
function makePokemon(params: {
  name?: string;
  types?: TypeName[];
  ability?: AbilityName;
  item?: ItemName | null;
  attack?: number;
  weightKg?: number;
  baseHP?: number;
} = {}): Pokemon {
  return new Pokemon({
    name: params.name ?? 'Mon',
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: params.item ?? null,
    weightKg: params.weightKg,
    baseStats: {
      HP: params.baseHP ?? 200, ATK: params.attack ?? 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100,
    },
  });
}

const suckerPunch = () => createMove({
  name: 'ふいうち', type: 'dark', power: 70, accuracy: 100, category: 'physical',
  priority: 1, failsUnlessTargetAttacks: true,
});
const foulPlay = () => createMove({
  name: 'イカサマ', type: 'dark', power: 95, accuracy: 100, category: 'physical', usesTargetAttack: true,
});
const tackle = () => createMove({ name: 'Tackle', type: 'normal', power: 95, accuracy: 100, category: 'physical' });
const grassKnot = () => createMove({
  name: 'くさむすび', type: 'grass', power: 0, accuracy: 100, category: 'special', weightBasedPower: true,
});
const knockOff = () => createMove({
  name: 'はたきおとす', type: 'dark', power: 65, accuracy: 100, category: 'physical', knockOff: true,
});
const poltergeist = () => createMove({
  name: 'ポルターガイスト', type: 'ghost', power: 110, accuracy: 90, category: 'physical', failsIfNoItem: true,
});
const assurance = () => createMove({
  name: 'ダメおし', type: 'dark', power: 60, accuracy: 100, category: 'physical', doublesIfTargetDamaged: true,
});
const flowerTrick = () => createMove({
  name: 'トリックフラワー', type: 'grass', power: 70, accuracy: 100, category: 'physical', alwaysCrit: true,
});

function setup(a: Pokemon, b: Pokemon): BattleEngine {
  const engine = new BattleEngine({ rng: fixedRandom(0.5) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  return engine;
}

describe('ふいうち', () => {
  test('相手が攻撃技を選んでいないと失敗する', () => {
    // Arrange
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    const engine = setup(attacker, defender);
    defender.intendsToAttackThisTurn = false;

    // Act
    const result = engine.useMove(attacker, defender, suckerPunch());

    // Assert
    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') throw new Error('unreachable');
    expect(result.reason).toBe('target-not-attacking');
    expect(defender.currentHP).toBe(defender.maxHP);
  });

  test('相手が攻撃技を選んでいれば当たる', () => {
    // Arrange
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    const engine = setup(attacker, defender);
    defender.intendsToAttackThisTurn = true;

    // Act
    const result = engine.useMove(attacker, defender, suckerPunch());

    // Assert
    expect(result.outcome).toBe('damaged');
    expect(defender.currentHP).toBeLessThan(defender.maxHP);
  });
});

describe('イカサマ', () => {
  test('自分のこうげきではなく相手のこうげきでダメージが決まる', () => {
    // Arrange: 使い手はこうげき10、相手はこうげき200
    const weakUser = makePokemon({ name: 'Weak', attack: 10 });
    const strongTarget = makePokemon({ name: 'Strong', attack: 200 });
    const engine = setup(weakUser, strongTarget);

    // Act
    const foul = engine.useMove(weakUser, strongTarget, foulPlay());

    // Assert: 同じ威力の通常技（使い手のこうげき10で計算）より大きい
    if (foul.outcome !== 'damaged') throw new Error(`damaged を期待: ${foul.outcome}`);
    const engine2 = setup(makePokemon({ name: 'Weak', attack: 10 }), makePokemon({ name: 'Strong', attack: 200 }));
    const normal = engine2.useMove(
      engine2['activePokemon0']!, engine2['activePokemon1']!, tackle(),
    );
    if (normal.outcome !== 'damaged') throw new Error(`damaged を期待: ${normal.outcome}`);
    expect(foul.damage).toBeGreaterThan(normal.damage);
  });
});

describe('くさむすび', () => {
  test('相手の体重で威力が変わる（重いほど強い）', () => {
    // Arrange
    const light = makePokemon({ name: 'Light', weightKg: 5 });   // 威力20
    const heavy = makePokemon({ name: 'Heavy', weightKg: 300 }); // 威力120
    const user1 = makePokemon({ name: 'User' });
    const user2 = makePokemon({ name: 'User' });
    const engine1 = setup(user1, light);
    const engine2 = setup(user2, heavy);

    // Act
    const vsLight = engine1.useMove(user1, light, grassKnot());
    const vsHeavy = engine2.useMove(user2, heavy, grassKnot());

    // Assert
    if (vsLight.outcome !== 'damaged' || vsHeavy.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(vsHeavy.damage).toBeGreaterThan(vsLight.damage);
  });

  test('体重の境界で威力が決まる', () => {
    // Arrange
    const engine = setup(makePokemon(), makePokemon());

    // Act & Assert
    expect(engine.powerFromWeight(5)).toBe(20);
    expect(engine.powerFromWeight(24)).toBe(40);
    expect(engine.powerFromWeight(49)).toBe(60);
    expect(engine.powerFromWeight(99)).toBe(80);
    expect(engine.powerFromWeight(199)).toBe(100);
    expect(engine.powerFromWeight(300)).toBe(120);
  });
});

describe('はたきおとす', () => {
  test('持ち物を持つ相手には威力が上がり、命中後に持ち物を落とす', () => {
    // Arrange
    const withItem = makePokemon({ name: 'WithItem', item: 'leftovers' });
    const without = makePokemon({ name: 'Without' });
    const user1 = makePokemon({ name: 'User' });
    const user2 = makePokemon({ name: 'User' });
    const engine1 = setup(user1, withItem);
    const engine2 = setup(user2, without);

    // Act
    const vsItem = engine1.useMove(user1, withItem, knockOff());
    const vsNone = engine2.useMove(user2, without, knockOff());

    // Assert
    if (vsItem.outcome !== 'damaged' || vsNone.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(vsItem.damage).toBeGreaterThan(vsNone.damage);
    expect(withItem.item).toBeNull();
    expect(engine1.getLog()).toContain('落とした');
  });

  test('メガストーンは落とせない', () => {
    // Arrange
    const mega = makePokemon({ name: 'Mega', item: 'garchompite-z' });
    const user = makePokemon({ name: 'User' });
    const engine = setup(user, mega);

    // Act
    engine.useMove(user, mega, knockOff());

    // Assert
    expect(mega.item).toBe('garchompite-z');
    expect(engine.hasRemovableItem(mega)).toBe(false);
  });
});

describe('ポルターガイスト', () => {
  test('相手が持ち物を持っていなければ失敗する', () => {
    // Arrange
    const noItem = makePokemon({ name: 'NoItem', types: ['water'] });
    const user = makePokemon({ name: 'User' });
    const engine = setup(user, noItem);

    // Act
    const result = engine.useMove(user, noItem, poltergeist());

    // Assert
    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') throw new Error('unreachable');
    expect(result.reason).toBe('no-item');
  });

  test('持ち物を持っていれば当たる', () => {
    // Arrange
    // ゴースト技はノーマルに無効のため、等倍のみずタイプを相手にする
    const withItem = makePokemon({ name: 'WithItem', item: 'leftovers', types: ['water'] });
    const user = makePokemon({ name: 'User' });
    const engine = setup(user, withItem);

    // Act
    const result = engine.useMove(user, withItem, poltergeist());

    // Assert
    expect(result.outcome).toBe('damaged');
  });
});

describe('ダメおし', () => {
  test('そのターン既にダメージを受けている相手には威力が2倍になる', () => {
    // Arrange
    const damaged = makePokemon({ name: 'Damaged' });
    const fresh = makePokemon({ name: 'Fresh' });
    const user1 = makePokemon({ name: 'User' });
    const user2 = makePokemon({ name: 'User' });
    const engine1 = setup(user1, damaged);
    const engine2 = setup(user2, fresh);

    // Act: 先に1発当ててからダメおしを撃つ
    engine1.useMove(user1, damaged, tackle());
    const doubled = engine1.useMove(user1, damaged, assurance());
    const plain = engine2.useMove(user2, fresh, assurance());

    // Assert
    if (doubled.outcome !== 'damaged' || plain.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(doubled.damage).toBeGreaterThan(plain.damage);
  });

  test('ターンが変わると記録は消える', () => {
    // Arrange
    const damaged = makePokemon({ name: 'Damaged' });
    const user = makePokemon({ name: 'User' });
    const engine = setup(user, damaged);
    engine.useMove(user, damaged, tackle());

    // Act
    engine.startTurn();
    engine.endTurn([], []);

    // Assert
    const plain = engine.useMove(user, damaged, assurance());
    if (plain.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(plain.outcome).toBe('damaged');
  });
});

describe('トリックフラワー', () => {
  test('必ず急所に当たる（同じ威力の通常技より大きい）', () => {
    // Arrange
    const target1 = makePokemon({ name: 'Target' });
    const target2 = makePokemon({ name: 'Target' });
    const user1 = makePokemon({ name: 'User' });
    const user2 = makePokemon({ name: 'User' });
    const engine1 = setup(user1, target1);
    const engine2 = setup(user2, target2);

    // Act
    const crit = engine1.useMove(user1, target1, flowerTrick());
    const normal = engine2.useMove(user2, target2, createMove({
      name: 'リーフブレード', type: 'grass', power: 70, accuracy: 100, category: 'physical',
    }));

    // Assert
    if (crit.outcome !== 'damaged' || normal.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(crit.damage).toBeGreaterThan(normal.damage);
    expect(engine1.getLog()).toContain('急所に当たった');
  });

  test('シェルアーマーの相手には急所に当たらない', () => {
    // Arrange
    const armored = makePokemon({ name: 'Armored', ability: 'shell-armor' });
    const user = makePokemon({ name: 'User' });
    const engine = setup(user, armored);

    // Act
    const result = engine.useMove(user, armored, flowerTrick());

    // Assert
    expect(result.outcome).toBe('damaged');
    expect(engine.getLog()).not.toContain('急所に当たった');
  });
});
