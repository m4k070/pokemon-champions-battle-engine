import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// 場に残る効果を持つ技。オーロラベール・ねがいごと・ミストフィールド。
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

const auroraVeil = () => createMove({
  name: 'オーロラベール', type: 'ice', category: 'status', fieldEffect: 'aurora-veil',
});
const wish = () => createMove({ name: 'ねがいごと', type: 'normal', category: 'status', wishes: true });
const mistyTerrain = () => createMove({
  name: 'ミストフィールド', type: 'fairy', category: 'status', fieldEffect: 'misty-terrain',
});
const tackle = () => createMove({ name: 'Tackle', type: 'normal', power: 100, accuracy: 100, category: 'physical' });
const dragonClaw = () => createMove({
  name: 'ドラゴンクロー', type: 'dragon', power: 80, accuracy: 100, category: 'physical',
});
const thunderWave = () => createMove({
  name: 'でんじは', type: 'electric', category: 'status', status: 'paralysis',
});

function setup(a: Pokemon, b: Pokemon): BattleEngine {
  const engine = new BattleEngine({ rng: fixedRandom(0.5) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  return engine;
}

describe('オーロラベール', () => {
  test('5ターン張られ、受けるダメージが半減する', () => {
    // Arrange
    const guarded = makePokemon({ name: 'Guarded' });
    const bare = makePokemon({ name: 'Bare' });
    const foe1 = makePokemon({ name: 'Foe' });
    const foe2 = makePokemon({ name: 'Foe' });
    const engine1 = setup(guarded, foe1);
    const engine2 = setup(bare, foe2);

    // Act
    engine1.useMove(guarded, foe1, auroraVeil());
    const shielded = engine1.useMove(foe1, guarded, tackle());
    const plain = engine2.useMove(foe2, bare, tackle());

    // Assert
    expect(engine1.field.auroraVeil.playerA).toBe(5);
    if (shielded.outcome !== 'damaged' || plain.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(shielded.damage).toBeLessThan(plain.damage);
  });

  test('ターンが進むと残りターンが減る', () => {
    // Arrange
    const guarded = makePokemon({ name: 'Guarded' });
    const foe = makePokemon({ name: 'Foe' });
    const engine = setup(guarded, foe);
    engine.useMove(guarded, foe, auroraVeil());

    // Act
    engine.startTurn();

    // Assert
    expect(engine.field.auroraVeil.playerA).toBe(4);
  });
});

describe('ねがいごと', () => {
  test('次のターンの終了時に最大HPの半分回復する', () => {
    // Arrange
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    const engine = setup(user, foe);

    // Act
    const result = engine.useMove(user, foe, wish());
    expect(result.outcome).toBe('effect-applied');
    expect(engine.field.wish.playerA).toBe(2);

    engine.endTurn([user], [foe]);        // 1ターン目終了: まだ回復しない
    expect(engine.field.wish.playerA).toBe(1);
    expect(user.currentHP).toBe(user.maxHP);

    user.currentHP = 50;                  // 減らしておく
    engine.endTurn([user], [foe]);        // 2ターン目終了: 回復する

    // Assert
    expect(engine.field.wish.playerA).toBe(0);
    expect(user.currentHP).toBe(50 + Math.floor(user.maxHP / 2));
    expect(engine.getLog()).toContain('願い事で');
  });
});

describe('ミストフィールド', () => {
  test('5ターン展開され、接地している相手は状態異常にならない', () => {
    // Arrange
    const user = makePokemon({ name: 'User' });
    const grounded = makePokemon({ name: 'Grounded', types: ['water'] });
    const engine = setup(user, grounded);

    // Act
    const terrain = engine.useMove(user, grounded, mistyTerrain());
    const status = engine.useMove(user, grounded, thunderWave());

    // Assert
    expect(terrain.outcome).toBe('effect-applied');
    expect(engine.field.terrain).toBe('misty-terrain');
    expect(engine.field.terrainTurnsLeft).toBe(5);
    expect(status.outcome).toBe('no-effect');
    expect(grounded.status).toBeNull();
  });

  test('接地していない相手（ひこう）は守られない', () => {
    // Arrange
    const user = makePokemon({ name: 'User' });
    const flying = makePokemon({ name: 'Flying', types: ['flying'] });
    const engine = setup(user, flying);
    engine.useMove(user, flying, mistyTerrain());

    // Act
    const status = engine.useMove(user, flying, thunderWave());

    // Assert
    expect(status.outcome).toBe('status-inflicted');
    expect(flying.status).toBe('paralysis');
  });

  test('接地している相手へのドラゴン技は威力が半減する', () => {
    // Arrange
    const dragon = makePokemon({ name: 'Dragon', types: ['dragon'] });
    const user1 = makePokemon({ name: 'User' });
    const user2 = makePokemon({ name: 'User' });
    const engine1 = setup(user1, dragon);
    const engine2 = setup(user2, makePokemon({ name: 'Dragon', types: ['dragon'] }));

    // Act
    engine1.useMove(user1, dragon, mistyTerrain());
    const weakened = engine1.useMove(user1, dragon, dragonClaw());
    const plain = engine2.useMove(engine2.activePokemon0!, engine2.activePokemon1!, dragonClaw());

    // Assert
    if (weakened.outcome !== 'damaged' || plain.outcome !== 'damaged') throw new Error('damaged を期待');
    expect(weakened.damage).toBeLessThan(plain.damage);
  });

  test('ターンが進むとフィールドが消える', () => {
    // Arrange
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    const engine = setup(user, foe);
    engine.useMove(user, foe, mistyTerrain());

    // Act
    for (let i = 0; i < 5; i++) engine.startTurn();

    // Assert
    expect(engine.field.terrain).toBeNull();
  });
});
