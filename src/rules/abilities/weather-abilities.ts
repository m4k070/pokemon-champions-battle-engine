import type { WeatherType } from '../../types.js';
import type { AbilityDefinition } from './types.js';
import type { AbilityName } from '../../ability-names.js';

interface WeatherAbilityConfig {
  name: AbilityName;
  label: string;
  weather: WeatherType;
  description: string;
  turns?: number;
}

function weatherSwitchInAbility(config: WeatherAbilityConfig): AbilityDefinition {
  return {
    name: config.name,
    onSwitchIn: ({ pokemon, engine }) => {
      if (engine.weather === config.weather) return;
      engine.weather = config.weather;
      engine.weatherTurnsLeft = config.turns ?? 5;
      engine.log.push(`${pokemon.name}の特性「${config.label}」により${config.description}`);
    },
  };
}

export const SAND_STREAM = weatherSwitchInAbility({
  name: 'sand-stream',
  label: 'すなおこし',
  weather: 'sand',
  description: '砂嵐が発生した',
});

export const DRIZZLE = weatherSwitchInAbility({
  name: 'drizzle',
  label: 'あめふらし',
  weather: 'rain',
  description: '雨が降り出した',
});

export const DROUGHT = weatherSwitchInAbility({
  name: 'drought',
  label: 'ひでり',
  weather: 'sun',
  description: '日差しが強くなった',
});

export const SNOW_WARNING = weatherSwitchInAbility({
  name: 'snow-warning',
  label: 'ゆきふらし',
  weather: 'hail',
  description: 'あられが降り始めた',
});

export const WEATHER_ABILITIES: AbilityDefinition[] = [SAND_STREAM, DRIZZLE, DROUGHT, SNOW_WARNING];
