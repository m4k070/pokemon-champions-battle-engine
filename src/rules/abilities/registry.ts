import type { AbilityDefinition } from './types.js';
import { WEATHER_ABILITIES } from './weather-abilities.js';
import { INTIMIDATE } from './intimidate.js';
import { BULLETPROOF } from './bulletproof.js';
import { META_ABILITIES } from './meta-abilities.js';

// 特性名(Pokemon.ability文字列)からAbilityDefinitionを引くレジストリ。
// 新しい特性を追加するときは、対応するAbilityDefinitionを実装してこの配列に加えるだけでよい。
const ABILITY_DEFINITIONS: AbilityDefinition[] = [...WEATHER_ABILITIES, INTIMIDATE, BULLETPROOF, ...META_ABILITIES];

export const ABILITY_REGISTRY: Readonly<Record<string, AbilityDefinition>> = Object.fromEntries(
  ABILITY_DEFINITIONS.map((ability) => [ability.name, ability])
);

export function getAbilityDefinition(name: string): AbilityDefinition | undefined {
  return ABILITY_REGISTRY[name];
}
