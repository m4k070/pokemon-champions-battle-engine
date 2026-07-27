import type { BattleEngine } from '../battle-engine.js';
import type { EventData } from '../types.js';

export class AbilityHandlers {
  private engine: BattleEngine;

  constructor(engine: BattleEngine) {
    this.engine = engine;
  }

  setup(): void {
    this.engine.events.on('switch-in', (data: EventData) => {
      const pokemon = data.pokemon;
      if (!pokemon || typeof pokemon !== 'object') return;

      const p = pokemon as any;

      if (p.ability === 'sand-stream' && this.engine.weather !== 'sand') {
        this.engine.weather = 'sand';
        this.engine.weatherTurnsLeft = 5;
        this.engine.log.push(`${p.name}の特性「すなおこし」により砂嵐が発生した`);
      }

      if (p.ability === 'intimidate') {
        const opponent = this.engine.getOpponent(p);
        if (opponent && !opponent.isFainted) {
          opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
          this.engine.log.push(`${p.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
        }
      }
    });
  }
}
