/**
 * AbilityHandlers - 特性のEvent Handler
 */
class AbilityHandlers {
  constructor(engine) {
    this.engine = engine;
  }
  
  setup() {
    // すなおこし
    this.engine.events.on('switch-in', (data) => {
      const { pokemon, engine } = data;
      
      if (pokemon.ability === 'sand-stream' && engine.weather !== 'sand') {
        engine.weather = 'sand';
        engine.weatherTurnsLeft = 5;
        engine.log.push(`${pokemon.name}の特性「すなおこし」により砂嵐が発生した`);
      }
      
      if (pokemon.ability === 'intimidate') {
        const opponent = engine.getOpponent(pokemon);
        if (opponent && !opponent.isFainted) {
          opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
          engine.log.push(`${pokemon.name}の特性「いかく」により${opponent.name}の攻撃が下がった`);
        }
      }
    });
  }
}

module.exports = { AbilityHandlers };
EOF