import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';

export interface DamageResult {
  damage: number;
}

export class DamageSection {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  calculate(_attack: number, _defense: number, move: MoveData, attacker: Pokemon, defender: Pokemon): DamageResult {
    if (move.power === 0) return { damage: 0 };

    let power = move.power;
    let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;
    let defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;

    if (attacker.types && attacker.types.includes(move.type)) {
      power *= 1.5;
    }

    if (attacker.item === 'life-orb') {
      power *= 1.3;
    }

    if (this.engine.weather === 'rain' && move.type === 'water') {
      power *= 1.5;
    } else if (this.engine.weather === 'sun' && move.type === 'fire') {
      power *= 1.5;
    } else if (this.engine.weather === 'rain' && move.type === 'fire') {
      power *= 0.5;
    } else if (this.engine.weather === 'sun' && move.type === 'water') {
      power *= 0.5;
    }

    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }

    const damage = Math.floor(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2;

    return { damage };
  }
}
