import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { ABILITY_REGISTRY, getAbilityDefinition } from '../src/rules/abilities/registry.js';

function makeWeatherSetter(ability: string): Pokemon {
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
    expect(getAbilityDefinition('unknown-ability-xyz')).toBeUndefined();
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
