import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';

export class AttackSection {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  calculate(attacker: Pokemon, move: MoveData): number {
    let attack = move.category === 'physical' ? attacker.stats.ATK : attacker.stats.SPATK;

    if (attacker.status === 'burn' && move.category === 'physical') {
      attack = Math.floor(attack / 2);
    }

    this.engine.events.emit('calculate-attack', { attacker, move, attack });

    return attack;
  }
}
