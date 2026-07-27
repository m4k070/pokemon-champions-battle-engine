import type { Pokemon } from './pokemon.js';
export interface SwitchOption {
    pokemon: Pokemon;
    index: number;
}
export declare class Team {
    members: Pokemon[];
    activeIndex: number;
    constructor(pokemons?: Pokemon[]);
    get active(): Pokemon | undefined;
    switch(index: number): boolean;
    getAvailableSwitches(): SwitchOption[];
}
//# sourceMappingURL=team.d.ts.map