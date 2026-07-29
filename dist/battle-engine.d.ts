import { EventEmitter } from './event-emitter.js';
import { BattleField } from './battle-field.js';
import type { Pokemon } from './pokemon.js';
import type { MoveData, TypeName, WeatherType, TypeChart } from './types.js';
export interface UseMoveResult {
    success: boolean;
    damage?: number;
    effectiveness?: number;
    status?: string;
}
export declare class BattleEngine {
    events: EventEmitter;
    weather: WeatherType | null;
    weatherTurnsLeft: number;
    trickRoom: boolean;
    trickRoomTurnsLeft: number;
    turn: number;
    log: string[];
    typeChart: TypeChart;
    field: BattleField;
    private activePokemon0;
    private activePokemon1;
    constructor();
    private sideKey;
    setStealthRock(side: 0 | 1): void;
    setActivePokemon(side: 0 | 1, pokemon: Pokemon): void;
    getOpponent(pokemon: Pokemon): Pokemon | null;
    private setupEventHandlers;
    calculateAttack(attacker: Pokemon, move: {
        category: string;
    }): number;
    calculateDefense(defender: Pokemon, move: {
        category: string;
    }): number;
    calculateBaseDamage(attack: number, defense: number, move: MoveData): number;
    getTypeEffectiveness(attackType: TypeName, defenderTypes: TypeName[]): number;
    applyModifiers(baseDamage: number, attacker: Pokemon, defender: Pokemon, move: MoveData): {
        finalDamage: number;
        effectiveness: number;
    };
    applyDamage(defender: Pokemon, damage: number): void;
    useMove(attacker: Pokemon, defender: Pokemon, move: MoveData): UseMoveResult;
    startTurn(): void;
    endTurn(teamA: Pokemon[], teamB: Pokemon[]): void;
    applyWeatherDamage(team: Pokemon[]): void;
    applyStatusEffects(team: Pokemon[]): void;
    switchIn(pokemon: Pokemon, team: Pokemon[], side?: 0 | 1): Pokemon;
    calculateSpeed(pokemon: Pokemon): number;
    getLog(): string;
}
//# sourceMappingURL=battle-engine.d.ts.map