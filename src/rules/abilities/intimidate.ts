import type { AbilityDefinition } from './types.js';

export const INTIMIDATE: AbilityDefinition = {
  name: 'intimidate',
  onSwitchIn: ({ pokemon, engine }) => {
    const opponent = engine.getOpponent(pokemon);
    if (!opponent || opponent.isFainted) return;

    opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
    engine.log.push(`${pokemon.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
  },
};
