import { Pokemon } from '../src/pokemon.js';

function makePokemon(): Pokemon {
  return new Pokemon({
    name: 'Garchomp',
    types: ['dragon', 'ground'],
    ability: 'rough-skin',
    item: null,
    baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
  });
}

describe('Pokemon stat stages', () => {
  test('modifyStatStage clamps to -6..+6 and returns the actually applied delta', () => {
    const pokemon = makePokemon();

    expect(pokemon.modifyStatStage('ATK', -4)).toBe(-4);
    expect(pokemon.modifyStatStage('ATK', -4)).toBe(-2); // -6でクランプされるため実際は-2分だけ変化
    expect(pokemon.statStages.ATK).toBe(-6);
    expect(pokemon.modifyStatStage('ATK', -1)).toBe(0); // これ以上は下がらない

    expect(pokemon.modifyStatStage('SPEED', 10)).toBe(6);
    expect(pokemon.statStages.SPEED).toBe(6);
  });

  test('getStatStageMultiplier follows the standard +N/2 and 2/-N formula', () => {
    const pokemon = makePokemon();

    expect(pokemon.getStatStageMultiplier('ATK')).toBe(1);

    pokemon.modifyStatStage('ATK', 2);
    expect(pokemon.getStatStageMultiplier('ATK')).toBe(2); // (2+2)/2

    pokemon.resetStatStages();
    pokemon.modifyStatStage('ATK', -2);
    expect(pokemon.getStatStageMultiplier('ATK')).toBe(0.5); // 2/(2+2)
  });

  test('resetStatStages clears every stat back to 0', () => {
    const pokemon = makePokemon();
    pokemon.modifyStatStage('ATK', -2);
    pokemon.modifyStatStage('SPEED', 3);

    pokemon.resetStatStages();

    expect(pokemon.statStages).toEqual({ ATK: 0, DEF: 0, SPATK: 0, SPDEF: 0, SPEED: 0 });
  });
});
