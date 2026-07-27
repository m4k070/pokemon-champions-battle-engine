import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';
import type { MoveData } from '../types.js';

export interface ModifierResult {
  finalDamage: number;
  effectiveness: number;
}

export class ModifierSection {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  applyModifiers(baseDamage: number, attacker: Pokemon, defender: Pokemon, move: MoveData): ModifierResult {
    const effectiveness = this.engine.getTypeEffectiveness(move.type, defender.types);
    const finalDamage = Math.floor(baseDamage * effectiveness);

    this.engine.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });

    return { finalDamage, effectiveness };
  }
}
