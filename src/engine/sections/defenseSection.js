/**
 * DefenseSection - 防御力計算セクション
 */
class DefenseSection {
  constructor(engine) {
    this.engine = engine;
  }
  
  calculate(defender, move) {
    let defense = defender.stats[move.category === 'physical' ? 'DEF' : 'SPDEF'];
    
    this.engine.events.emit('calculate-defense', { defender, move, defense });
    
    return defense;
  }
}

module.exports = { DefenseSection };
EOF