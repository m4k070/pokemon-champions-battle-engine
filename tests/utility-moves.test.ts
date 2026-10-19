import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// 現環境の構築でよく使われる汎用技の効果。
//   みがわり: HPを1/4払って身代わりを出し、ダメージを身代わりが受ける
//   くろいきり: 場に出ている全員の能力変化をリセットする
//   ドレイン: 与えたダメージの一定割合を回復する
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

const substitute = () => createMove({
  name: 'みがわり', type: 'normal', category: 'status', createsSubstitute: true,
});
const haze = () => createMove({
  name: 'くろいきり', type: 'ice', category: 'status', resetsStatStages: true,
});
const tackle = () => createMove({
  name: 'Tackle', type: 'normal', power: 40, accuracy: 100, category: 'physical',
});
const leechLife = () => createMove({
  name: 'きゅうけつ', type: 'bug', power: 80, accuracy: 100, category: 'physical', drainPercent: 0.5,
});

describe('みがわり', () => {
  test('HPを1/4払って身代わりを出し、ダメージは身代わりが受ける（本体は減らない）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    const cost = Math.floor(user.maxHP / 4);

    // Act
    const result = engine.useMove(user, foe, substitute());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(user.currentHP).toBe(user.maxHP - cost);
    expect(user.substituteHP).toBe(cost);
    expect(engine.getLog()).toContain('身代わりを出した');

    // 身代わりがある間は本体のHPが減らない
    const hpBefore = user.currentHP;
    engine.useMove(foe, user, tackle());
    expect(user.currentHP).toBe(hpBefore);
    expect(user.substituteHP).toBeLessThan(cost);
    expect(engine.getLog()).toContain('身代わりに');

    // 身代わりのHPが尽きると壊れる
    for (let i = 0; i < 10 && user.substituteHP > 0; i++) {
      engine.useMove(foe, user, tackle());
    }
    expect(user.substituteHP).toBe(0);
    expect(engine.getLog()).toContain('みがわりは こわれた');
    expect(user.currentHP).toBe(hpBefore);
  });

  test('代償を払えないHPしか残っていないと失敗する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    user.currentHP = Math.floor(user.maxHP / 4); // 代償と同じ = 払えない

    // Act
    const result = engine.useMove(user, foe, substitute());

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('not-enough-hp');
    expect(user.substituteHP).toBe(0);
  });

  test('場を離れるとみがわりは消える（交代で解除）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    engine.useMove(user, foe, substitute());
    expect(user.substituteHP).toBeGreaterThan(0);

    // Act
    user.resetSubstitute();

    // Assert
    expect(user.substituteHP).toBe(0);
  });
});

describe('くろいきり', () => {
  test('場に出ている全員の能力変化をリセットする', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User' });
    const foe = makePokemon({ name: 'Foe' });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);
    user.statStages.ATK = 2;
    user.statStages.SPEED = -1;
    foe.statStages.DEF = 3;

    // Act
    const result = engine.useMove(user, foe, haze());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(user.statStages.ATK).toBe(0);
    expect(user.statStages.SPEED).toBe(0);
    expect(foe.statStages.DEF).toBe(0);
    expect(engine.getLog()).toContain('能力変化がリセットされた');
  });
});

describe('ドレイン技', () => {
  test('与えたダメージの半分だけ回復する', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    attacker.currentHP = 100; // 回復ぶんが分かるように減らしておく

    // Act
    const result = engine.useMove(attacker, defender, leechLife());

    // Assert
    if (result.outcome !== 'damaged') throw new Error(`damaged を期待: ${result.outcome}`);
    expect(result.damage).toBeGreaterThan(0);
    expect(attacker.currentHP).toBe(100 + Math.floor(result.damage / 2));
    expect(engine.getLog()).toContain('きゅうけつで');
  });

  test('HPが満タンなら回復しない（ダメージ自体は通る）', () => {
    // Arrange
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const attacker = makePokemon({ name: 'Attacker' });
    const defender = makePokemon({ name: 'Defender' });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);

    // Act
    const result = engine.useMove(attacker, defender, leechLife());

    // Assert
    expect(result.outcome).toBe('damaged');
    expect(attacker.currentHP).toBe(attacker.maxHP);
    expect(defender.currentHP).toBeLessThan(defender.maxHP);
  });
});
