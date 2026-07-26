/**
 * DamageApplierSection - ダメージ付与セクション
 */
class DamageApplierSection {
  constructor(engine) {
    this.engine = engine;
  }
  
  applyDamage(defender, damage) {
    this.engine.events.emit('apply-damage', { defender, damage, engine: this });
    defender.takeDamage(damage, this);
  }
}

module.exports = { DamageApplierSection };
EOF