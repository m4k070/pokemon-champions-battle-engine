import type { Pokemon } from './pokemon.js';

export interface SwitchOption {
  pokemon: Pokemon;
  index: number;
}

export class Team {
  members: Pokemon[];
  activeIndex: number;

  constructor(pokemons: Pokemon[] = []) {
    this.members = pokemons;
    this.activeIndex = 0;
  }

  get active(): Pokemon | undefined {
    return this.members[this.activeIndex];
  }

  switch(index: number): boolean {
    if (index >= 0 && index < this.members.length && !this.members[index].isFainted) {
      this.activeIndex = index;
      return true;
    }
    return false;
  }

  getAvailableSwitches(): SwitchOption[] {
    return this.members
      .map((p, i) => ({ pokemon: p, index: i }))
      .filter(({ pokemon }) => !pokemon.isFainted && this.members.indexOf(pokemon) !== this.activeIndex);
  }
}
