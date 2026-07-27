import type { Pokemon } from '../pokemon.js';
import type { TypeName } from '../types.js';

export interface MegaStoneConfig {
  pokemon: string;
  megaName: string;
  typeChange: TypeName[];
  abilityChange: string;
}

export class MegaEvolutionSystem {
  megaStones: Record<string, MegaStoneConfig>;

  constructor() {
    this.megaStones = {
      'charizardite-x': {
        pokemon: 'charizard',
        megaName: 'mega-charizard-x',
        typeChange: ['fire', 'dragon'],
        abilityChange: 'tough-claws',
      },
      'charizardite-y': {
        pokemon: 'charizard',
        megaName: 'mega-charizard-y',
        typeChange: ['fire', 'flying'],
        abilityChange: 'drought',
      },
      'garchompite': {
        pokemon: 'garchomp',
        megaName: 'mega-garchomp',
        typeChange: ['dragon', 'ground'],
        abilityChange: 'sand-force',
      },
    };
  }

  canMegaEvolve(pokemon: Pokemon): boolean {
    if (pokemon.isMega) return false;
    if (!pokemon.item) return false;

    const stone = this.megaStones[pokemon.item];
    if (!stone) return false;
    if (stone.pokemon !== pokemon.baseName) return false;

    return true;
  }

  megaEvolve(pokemon: Pokemon): boolean {
    if (!this.canMegaEvolve(pokemon)) {
      throw new Error(`${pokemon.name}はメガシンカできません`);
    }

    const stone = this.megaStones[pokemon.item!];

    pokemon.baseName = pokemon.name;
    pokemon.name = stone.megaName;
    pokemon.types = [...stone.typeChange];
    pokemon.ability = stone.abilityChange;
    pokemon.isMega = true;

    for (const stat of ['HP', 'ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED'] as const) {
      pokemon.stats[stat] += 100;
      pokemon.maxHP = pokemon.stats.HP;
      pokemon.currentHP = Math.min(pokemon.currentHP + 100, pokemon.maxHP);
    }

    return true;
  }
}
