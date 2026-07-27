import type { BattleEngine } from '../battle-engine.js';
import type { Pokemon } from '../pokemon.js';

export class DamageApplierSection {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  applyDamage(defender: Pokemon, damage: number): void {
    this.engine.events.emit('apply-damage', { defender, damage, engine: this.engine });
    defender.takeDamage(damage, this.engine);
  }
}
