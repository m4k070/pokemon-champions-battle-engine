/**
 * ModifierSection - ダメージ補正セクション
 */
class ModifierSection {
  constructor(engine) {
    this.engine = engine;
  }
  
  applyModifiers(baseDamage, attacker, defender, move) {
    const effectiveness = this.engine.getTypeEffectiveness(move.type, defender.types);
    let finalDamage = Math.floor(baseDamage * effectiveness);
    
    this.engine.events.emit('apply-modifiers', { attacker, defender, move, finalDamage, effectiveness });
    
    return { finalDamage, effectiveness };
  }
}

module.exports = { ModifierSection };
EOF