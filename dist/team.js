export class Team {
    members;
    activeIndex;
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
//# sourceMappingURL=team.js.map