import type { AbilityDefinition } from './types.js';

export const INTIMIDATE: AbilityDefinition = {
  name: 'intimidate',
  onSwitchIn: ({ pokemon, engine }) => {
    const opponent = engine.getOpponent(pokemon);
    if (!opponent || opponent.isFainted) return;

    // きもったま（scrappy）持ちにはいかくが効かない（第8世代以降の仕様）。
    if (opponent.ability === 'scrappy') {
      engine.log.push(`${pokemon.name}の特性「いかく」が発動したが、${opponent.name}の特性「きもったま」で無効化された`);
      return;
    }

    const applied = opponent.modifyStatStage('ATK', -1);
    if (applied !== 0) {
      engine.log.push(`${pokemon.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
    } else {
      engine.log.push(`${pokemon.name}の特性「いかく」が発動したが、${opponent.name}の攻撃はこれ以上下がらない`);
    }
  },
};
