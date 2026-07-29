import { BattleEngine } from './battle-engine.js';
import { Pokemon } from './pokemon.js';
import type { SideFlags, SideHazards } from './battle-field.js';
import type { BaseStats, MoveData, Stats, StatusCondition, TypeName, WeatherType } from './types.js';
export interface PokemonSnapshot {
    name: string;
    baseName: string;
    types: TypeName[];
    ability: string;
    item: string | null;
    itemUsed: boolean;
    lockedMove: number | null;
    baseStats: BaseStats;
    stats: Stats;
    moves: MoveData[];
    currentHP: number;
    status: StatusCondition | null;
    statusTurnsLeft: number;
    isMega: boolean;
}
export interface FieldSnapshot {
    stealthRock: SideFlags;
    spikes: SideHazards;
    toxicSpikes: SideHazards;
    stickyWeb: SideFlags;
    auroraVeil: SideHazards;
    reflect: SideHazards;
    lightScreen: SideHazards;
    tailwind: SideHazards;
}
export interface BattleSnapshot {
    turn: number;
    weather: WeatherType | null;
    weatherTurnsLeft: number;
    trickRoom: boolean;
    trickRoomTurnsLeft: number;
    log: string[];
    field: FieldSnapshot;
    teamA: PokemonSnapshot[];
    teamB: PokemonSnapshot[];
    activeIndexA: number;
    activeIndexB: number;
}
export declare function snapshotPokemon(pokemon: Pokemon): PokemonSnapshot;
export declare function restorePokemon(snapshot: PokemonSnapshot): Pokemon;
export declare function snapshotBattle(engine: BattleEngine, teamA: Pokemon[], teamB: Pokemon[], activeA: Pokemon, activeB: Pokemon): BattleSnapshot;
export interface RestoredBattle {
    engine: BattleEngine;
    teamA: Pokemon[];
    teamB: Pokemon[];
    activeA: Pokemon;
    activeB: Pokemon;
}
export declare function restoreBattle(snapshot: BattleSnapshot): RestoredBattle;
//# sourceMappingURL=battle-snapshot.d.ts.map