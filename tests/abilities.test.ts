import { createMove } from "../src/move.js";
import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';

import { ABILITY_REGISTRY, getAbilityDefinition } from '../src/rules/abilities/registry.js';
import type { AbilityName } from '../src/ability-names.js';

function makeWeatherSetter(ability: AbilityName): Pokemon {
  return new Pokemon({
    name: 'Weather Setter',
    types: ['normal'],
    ability,
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
  });
}

describe('Ability registry', () => {
  test('exposes every registered ability by name', () => {
    expect(getAbilityDefinition('sand-stream')).toBe(ABILITY_REGISTRY['sand-stream']);
    // 外部データ経由で未知の特性名が入り込んだ場合の防御を実行時にも確認する。
    expect(getAbilityDefinition('unknown-ability-xyz' as AbilityName)).toBeUndefined();
  });

  test.each([
    ['drizzle', 'rain', 'あめふらし'],
    ['drought', 'sun', 'ひでり'],
    ['snow-warning', 'hail', 'ゆきふらし'],
    ['sand-stream', 'sand', 'すなおこし'],
  ] as const)('%s sets weather to %s on switch-in', (ability, weather, label) => {
    const engine = new BattleEngine();
    const setter = makeWeatherSetter(ability);

    engine.switchIn(setter, [setter]);

    expect(engine.weather).toBe(weather);
    expect(engine.weatherTurnsLeft).toBe(5);
    expect(engine.log.some((line) => line.includes(label))).toBe(true);
  });

  test('does not reset weatherTurnsLeft if the same weather is already active', () => {
    const engine = new BattleEngine();
    engine.weather = 'rain';
    engine.weatherTurnsLeft = 1;

    const setter = makeWeatherSetter('drizzle');
    engine.switchIn(setter, [setter]);

    expect(engine.weatherTurnsLeft).toBe(1);
  });

  test('a Pokemon with no registered ability does not affect switch-in at all', () => {
    const engine = new BattleEngine();
    const plain = makeWeatherSetter('run-away');

    expect(() => engine.switchIn(plain, [plain])).not.toThrow();
    expect(engine.weather).toBeNull();
  });
});

describe('ぼうだん (Bulletproof)', () => {
  function makeBulletproofDefender(): Pokemon {
    return new Pokemon({
      name: 'Chesnaught',
      types: ['grass', 'fighting'],
      ability: 'bulletproof',
      item: null,
      baseStats: { HP: 88, ATK: 107, DEF: 122, SPATK: 74, SPDEF: 75, SPEED: 64 },
    });
  }

  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Mega Raichu',
      types: ['electric'],
      ability: 'none',
      item: null,
      baseStats: { HP: 60, ATK: 90, DEF: 55, SPATK: 140, SPDEF: 90, SPEED: 130 },
    });
  }

  test('blocksMove reports ball/bomb moves only', () => {
    const bulletproof = getAbilityDefinition('bulletproof');

    expect(bulletproof?.blocksMove?.(createMove({ name: 'focus-blast', type: 'fighting', power: 120, category: 'special' }))).toBe(true);
    expect(bulletproof?.blocksMove?.(createMove({ name: 'shadow-ball', type: 'ghost', power: 80, category: 'special' }))).toBe(true);
    expect(bulletproof?.blocksMove?.(createMove({ name: 'thunderbolt', type: 'electric', power: 90, category: 'special' }))).toBe(false);
  });

  test('a ball/bomb move deals no damage to a Bulletproof Pokemon', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeBulletproofDefender();
    const hpBefore = defender.currentHP;

    const result = engine.useMove(attacker, defender, createMove({
      name: 'focus-blast', type: 'fighting', power: 120, accuracy: 100, category: 'special',
    }));

    expect(result.success).toBe(false);
    expect(defender.currentHP).toBe(hpBefore);
    expect(engine.log.some((line) => line.includes('bulletproof'))).toBe(true);
  });

  test('a non ball/bomb move still damages a Bulletproof Pokemon', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeBulletproofDefender();

    const result = engine.useMove(attacker, defender, createMove({
      name: 'thunderbolt', type: 'electric', power: 90, accuracy: 100, category: 'special',
    }));

    expect(result.success).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
  });

  test('PP is consumed even when the move is blocked', () => {
    const engine = new BattleEngine();
    const move = createMove({ name: 'focus-blast', type: 'fighting', power: 120, accuracy: 100, category: 'special', pp: 5, maxPP: 5 });

    engine.useMove(makeAttacker(), makeBulletproofDefender(), move);

    expect(move.pp).toBe(4);
  });
});
