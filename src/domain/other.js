/**
 * Move, Ability, Item, Team, BattleField, BattleState
 */
class Move {
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

class Ability {
  constructor(data) {
    this.name = data.name;
    this.description = data.description;
    this.isHidden = data.isHidden || false;
  }
}

class Item {
  constructor(data) {
    this.name = data.name;
    this.category = data.category;
    this.effect = data.effect;
  }
}

class Team {
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

class BattleField {
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

class BattleState {
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

module.exports = { Move, Ability, Item, Team, BattleField, BattleState };
EOF