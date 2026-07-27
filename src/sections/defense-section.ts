import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';

export class DefenseSection {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  calculate(defender: Pokemon, move: MoveData): number {
    const defense = move.category === 'physical' ? defender.stats.DEF : defender.stats.SPDEF;

    this.engine.events.emit('calculate-defense', { defender, move, defense });

    return defense;
  }
}
