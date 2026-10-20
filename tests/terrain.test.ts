import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import { asDamageResult } from './helpers/use-move-result.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// フィールド（地形）の検証。サイコフィールドは
//   1. エスパー技の威力1.3倍
//   2. 先制技の無効化
// を「接地している」ポケモンにだけ与える（ひこう・ふゆうは恩恵を受けない）。
function makePokemon(params: {
  name?: string;
  types?: TypeName[];
  ability?: AbilityName;
  item?: ItemName | null;
} = {}): Pokemon {
  return new Pokemon({
    name: params.name ?? 'Mon',
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: params.item ?? null,
    baseStats: { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
  });
}

const psychicField = () => createMove({
  name: 'サイコフィールド', type: 'psychic', category: 'status', fieldEffect: 'psychic-terrain',
});
const psychic = () => createMove({
  name: 'サイコキネシス', type: 'psychic', power: 90, accuracy: 100, category: 'special',
});
const expandingForce = () => createMove({
  name: 'ワイドフォース', type: 'psychic', power: 80, accuracy: 100, category: 'special',
  boostedByPsychicTerrain: true,
});
const shadowSneak = () => createMove({
  name: 'かげうち', type: 'ghost', power: 40, accuracy: 100, category: 'physical', priority: 1,
});

describe('サイコフィールドの展開', () => {
  test('サイコフィールドを展開すると5ターン継続する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const target = makePokemon({ name: 'Target' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);

    // Act
    const result = engine.useMove(user, target, psychicField());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(engine.field.terrain).toBe('psychic-terrain');
    expect(engine.field.terrainTurnsLeft).toBe(5);
  });

  test('グランドコート持ちなら8ターン継続する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User', item: 'terrain-extender' });
    const target = makePokemon({ name: 'Target' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);

    // Act
    engine.useMove(user, target, psychicField());

    // Assert
    expect(engine.field.terrainTurnsLeft).toBe(8);
  });

  test('5ターン経過すると消える', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon();
    const target = makePokemon();
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    engine.useMove(user, target, psychicField());

    // Act
    for (let i = 0; i < 5; i++) engine.startTurn();

    // Assert
    expect(engine.field.terrain).toBeNull();
  });
});

describe('サイコフィールド: エスパー技の威力1.3倍（接地している場合のみ）', () => {
  function damageOf(attacker: Pokemon, withTerrain: boolean): number {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    if (withTerrain) {
      engine.field.terrain = 'psychic-terrain';
      engine.field.terrainTurnsLeft = 5;
    }
    return asDamageResult(engine.useMove(attacker, defender, psychic())).damage;
  }

  test('接地している（ノーマル）と威力が上がる', () => {
    const attacker = makePokemon({ name: 'Grounded' });
    expect(damageOf(attacker, true)).toBeGreaterThan(damageOf(attacker, false));
  });

  test('ひこうタイプは恩恵を受けない', () => {
    const attacker = makePokemon({ name: 'Flying', types: ['psychic', 'flying'] });
    expect(damageOf(attacker, true)).toBe(damageOf(attacker, false));
  });

  test('ふゆう特性は恩恵を受けない', () => {
    const attacker = makePokemon({ name: 'Levitate', types: ['psychic'], ability: 'levitate' });
    expect(damageOf(attacker, true)).toBe(damageOf(attacker, false));
  });

  test('エスパー技以外は上がらない', () => {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Grounded' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    const tackle = () => createMove({ name: 'tackle', type: 'normal', power: 80, accuracy: 100, category: 'physical' });
    const without = asDamageResult(engine.useMove(attacker, defender, tackle())).damage;

    engine.field.terrain = 'psychic-terrain';
    const with_ = asDamageResult(engine.useMove(attacker, defender, tackle())).damage;

    expect(with_).toBe(without);
  });
});

describe('ワイドフォース: サイコフィールド下で接地していれば威力1.5倍', () => {
  function damageOf(attacker: Pokemon, withTerrain: boolean): number {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    if (withTerrain) {
      engine.field.terrain = 'psychic-terrain';
      engine.field.terrainTurnsLeft = 5;
    }
    return asDamageResult(engine.useMove(attacker, defender, expandingForce())).damage;
  }

  test('接地していれば威力が上がる', () => {
    const attacker = makePokemon({ name: 'Grounded' });
    expect(damageOf(attacker, true)).toBeGreaterThan(damageOf(attacker, false));
  });

  test('ひこうタイプは恩恵を受けない', () => {
    const attacker = makePokemon({ name: 'Flying', types: ['psychic', 'flying'] });
    expect(damageOf(attacker, true)).toBe(damageOf(attacker, false));
  });

  test('ふゆう特性は恩恵を受けない', () => {
    const attacker = makePokemon({ name: 'Levitate', types: ['psychic'], ability: 'levitate' });
    expect(damageOf(attacker, true)).toBe(damageOf(attacker, false));
  });
});

describe('サイコフィールド: 先制技の無効化', () => {
  test('接地している相手には先制技が効かない', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const grounded = makePokemon({ name: 'Grounded' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, grounded);
    engine.field.terrain = 'psychic-terrain';

    // Act
    const result = engine.useMove(user, grounded, shadowSneak());

    // Assert
    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') throw new Error('unreachable');
    expect(result.reason).toBe('blocked-by-terrain');
    expect(grounded.currentHP).toBe(grounded.maxHP);
  });

  test('接地していない相手（ひこう・ふゆう）には先制技が効く', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    // ノーマルはゴースト技を無効化するため、タイプ相性が等倍のみずタイプにする
    const flying = makePokemon({ name: 'Flying', types: ['water', 'flying'] });
    const levitate = makePokemon({ name: 'Levitate', types: ['water'], ability: 'levitate' });
    engine.setActivePokemon(0, user);
    engine.field.terrain = 'psychic-terrain';

    // Act
    const flyingResult = engine.useMove(user, flying, shadowSneak());
    const levitateResult = engine.useMove(user, levitate, shadowSneak());

    // Assert
    expect(flyingResult.outcome).toBe('damaged');
    expect(levitateResult.outcome).toBe('damaged');
  });

  test('フィールドが無ければ先制技は通常どおり効く', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const grounded = makePokemon({ name: 'Grounded', types: ['water'] });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, grounded);

    // Act
    const result = engine.useMove(user, grounded, shadowSneak());

    // Assert
    expect(result.outcome).toBe('damaged');
  });

  test('優先度0の技はフィールド下でも効く', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const grounded = makePokemon({ name: 'Grounded', types: ['water'] });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, grounded);
    engine.field.terrain = 'psychic-terrain';
    const normalPriority = createMove({
      name: 'シャドークロー', type: 'ghost', power: 70, accuracy: 100, category: 'physical',
    });

    // Act
    const result = engine.useMove(user, grounded, normalPriority);

    // Assert
    expect(result.outcome).toBe('damaged');
  });
});

describe('だいちのはどう（フィールドでタイプと威力が変わる）', () => {
  // ノーマル特殊・威力50。フィールド上ではタイプが変わり威力2倍。
  // 使用者が接地している場合のみ（ふゆう・ひこうは変化しない）。
  const terrainPulse = () => createMove({
    name: 'だいちのはどう', type: 'normal', power: 50, accuracy: 100, pp: 10,
    category: 'special', terrainPulse: true,
  });

  // 計算に渡された技（タイプ・威力）を捕まえる。
  function useAndCapture(
    terrain: 'psychic-terrain' | 'electric-terrain' | 'grassy-terrain' | 'misty-terrain' | null,
    attackerParams: { types?: TypeName[]; ability?: AbilityName } = {},
  ): { type: string; power: number } {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    // ノーマル単の相手なら、どの変化後タイプでも等倍なので威力だけを比べられる。
    const user = makePokemon({ name: 'User', types: attackerParams.types ?? ['water'], ability: attackerParams.ability });
    const target = makePokemon({ name: 'Target', types: ['normal'] });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    engine.field.terrain = terrain;
    engine.field.terrainTurnsLeft = terrain === null ? 0 : 5;

    let captured: { type: string; power: number } = { type: '', power: 0 };
    engine.events.on('calculate-attack', (data) => {
      const move = data.move as { type: string; power: number };
      captured = { type: move.type, power: move.power };
    });
    engine.useMove(user, target, terrainPulse());
    return captured;
  }

  test.each([
    // サイコフィールドは接地したエスパー技をさらに1.3倍するため 50→100→130 になる。
    // グラスフィールドのくさ技1.5倍は未実装なので、だいちのはどうの2倍だけが乗る。
    ['psychic-terrain', 'psychic', 130],
    ['electric-terrain', 'electric', 100],
    ['grassy-terrain', 'grass', 100],
    ['misty-terrain', 'fairy', 100],
  ] as const)('%s では %s タイプ・威力が2倍になる', (terrain, expectedType, expectedPower) => {
    const captured = useAndCapture(terrain);
    expect(captured.type).toBe(expectedType);
    expect(captured.power).toBe(expectedPower);
  });

  test('フィールドが無ければノーマル・威力50のまま', () => {
    const captured = useAndCapture(null);
    expect(captured.type).toBe('normal');
    expect(captured.power).toBe(50);
  });

  test('接地していない（ひこうタイプ）とフィールド下でも変化しない', () => {
    const captured = useAndCapture('psychic-terrain', { types: ['water', 'flying'] });
    expect(captured.type).toBe('normal');
    expect(captured.power).toBe(50);
  });

  test('接地していない（ふゆう）とフィールド下でも変化しない', () => {
    const captured = useAndCapture('electric-terrain', { ability: 'levitate' });
    expect(captured.type).toBe('normal');
    expect(captured.power).toBe(50);
  });
});
