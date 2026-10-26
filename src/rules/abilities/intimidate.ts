import type { AbilityDefinition } from './types.js';

export const INTIMIDATE: AbilityDefinition = {
  name: 'intimidate',
  onSwitchIn: ({ pokemon, engine }) => {
    const opponent = engine.getOpponent(pokemon);
    if (!opponent || opponent.isFainted) return;

    // いかくが発動したこと自体が観測される（不完全情報モードで特性が公開される）。
    engine.observeAbility(pokemon);

    // きもったま（scrappy）持ちにはいかくが効かない（第8世代以降の仕様）。
    if (opponent.ability === 'scrappy') {
      engine.log.push(`${pokemon.name}の特性「いかく」が発動したが、${opponent.name}の特性「きもったま」で無効化された`);
      return;
    }

    // クリアボディ / フラワーヴェールは能力低下を防ぐ。
    if (opponent.ability === 'clear-body' || engine.flowerVeilProtects(opponent)) {
      engine.observeAbility(opponent);
      engine.log.push(`${pokemon.name}の特性「いかく」は${opponent.name}の${opponent.ability}で防がれた`);
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
