/**
 * Pokemon class
 * ポケモンの状態と行動を管理
 */
class Pokemon {
  constructor(data) {
    this.name = data.name;
    this.types = data.types;
    this.ability = data.ability;
    this.item = data.item;
    this.itemUsed = false;
    this.lockedMove = null;
    this.baseStats = data.baseStats;
    this.stats = this.calculateStats(data.baseStats, 50);
    this.moves = data.moves || [];
    this.currentHP = this.stats.HP;
    this.maxHP = this.stats.HP;
    this.status = null;
    this.statusTurnsLeft = 0;
    this.isFainted = false;
    this.lockedMove = null;
    this.itemUsed = false;
    this.baseName = data.name;
    this.isMega = false;
  }
  
  calculateStats(baseStats, level) {
    const stats = {};
    // HP = floor(((baseHP * 2 + 31 + floor(EP/4)) * level) / 100) + level + 10
    stats.HP = Math.floor(((baseStats.HP * 2 + 31) * 50) / 100) + 50 + 10;
    for (const stat of ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']) {
      stats[stat] = Math.floor(((baseStats[stat] * 2 + 31) * 50) / 100) + 5;
    }
    return stats;
  }
  
  takeDamage(damage, engine = null) {
    if (engine) {
      engine.events.emit('apply-damage', { defender: this, damage, engine });
    }
    
    this.currentHP = Math.max(0, this.currentHP - damage);
    if (this.currentHP === 0) {
      this.isFainted = true;
    }
  }
  
  heal(amount) {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }
  
  applyStatus(status) {
    if (this.status) return false;
    this.status = status;
    if (status === 'sleep') {
      this.statusTurnsLeft = Math.floor(Math.random() * 3) + 1;
    }
    return true;
  }
  
  removeStatus() {
    this.status = null;
    this.statusTurnsLeft = 0;
  }
  
  canUseMove(moveIndex) {
    if (this.lockedMove !== null && this.lockedMove !== moveIndex) {
      return false;
    }
    return true;
  }
  
  lockMove(moveIndex) {
    if (this.item === 'choice-scarf' || this.item === 'choice-band' || this.item === 'choice-specs') {
      this.lockedMove = moveIndex;
    }
  }
  
  resetLockedMove() {
    this.lockedMove = null;
  }
}

module.exports = { Pokemon };
EOF