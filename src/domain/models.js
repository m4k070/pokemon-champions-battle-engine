/**
 * Pokemonクラス - ポケモンの状態と行動を管理
 */
export class Pokemon {
  constructor(data) {
    this.name = data.name;
    this.types = data.types;
    this.ability = data.ability;
    this.item = data.item;
    this.itemUsed = false;
    this.lockedMove = null;
    this.baseStats = data.baseStats;
    this.stats = this.calculateStats(data.baseStats, 50); // Lv.50固定
    this.moves = data.moves || [];
    this.currentHP = this.stats.HP;
    this.maxHP = this.stats.HP;
    this.status = null;
    this.statusTurnsLeft = 0;
    this.isFainted = false;
  }

  calculateStats(baseStats, level) {
    const stats = {};
    // HP = floor(((baseHP * 2 + 31 + floor(SP/4)) * level) / 100) + level + 10
    // Lv.50, 個体値31, 能力ポイント(SP) = 0で計算
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
      this.statusTurnsLeft = Math.floor(Math.random() * 3) + 1; // 1-3ターン
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

export class Move {
  constructor(data) {
    this.name = data.name;
    this.type = data.type;
    this.power = data.power || 0;
    this.accuracy = data.accuracy || 100;
    this.pp = data.pp || 10;
    this.maxPP = data.maxPP || 10;
    this.category = data.category || 'physical';
    this.status = data.status || null;
    this.priority = data.priority || 0;
    this.effectChance = data.effectChance || null;
  }
}

export class Ability {
  constructor(data) {
    this.name = data.name;
    this.description = data.description;
    this.isHidden = data.isHidden || false;
  }
}

export class Item {
  constructor(data) {
    this.name = data.name;
    this.category = data.category;
    this.effect = data.effect;
  }
}

export class Team {
  constructor(pokemons = []) {
    this.members = pokemons;
    this.activeIndex = 0;
  }

  get active() {
    return this.members[this.activeIndex];
  }

  switch(index) {
    if (index >= 0 && index < this.members.length && !this.members[index].isFainted) {
      this.activeIndex = index;
      return true;
    }
    return false;
  }

  getAvailableSwitches() {
    return this.members
      .map((p, i) => ({ pokemon: p, index: i }))
      .filter(({ pokemon }) => !pokemon.isFainted && this.members.indexOf(pokemon) !== this.activeIndex);
  }
}

export class BattleField {
  constructor() {
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.stealthRock = { playerA: false, playerB: false };
    this.spikes = { playerA: 0, playerB: 0 };
    this.toxicSpikes = { playerA: 0, playerB: 0 };
    this.stickyWeb = { playerA: false, playerB: false };
    this.auroraVeil = { playerA: 0, playerB: 0 };
    this.reflect = { playerA: 0, playerB: 0 };
    this.lightScreen = { playerA: 0, playerB: 0 };
    this.tailwind = { playerA: 0, playerB: 0 };
    this.trickRoomTurnsLeft = 0;
  }
}

export class BattleState {
  constructor() {
    this.turn = 0;
    this.weather = null;
    this.weatherTurnsLeft = 0;
    this.trickRoom = false;
    this.trickRoomTurnsLeft = 0;
    this.log = [];
    this.forceEnd = false;
  }
}

export { Pokemon, Move, Ability, Item, Team, BattleField, BattleState };
EOF