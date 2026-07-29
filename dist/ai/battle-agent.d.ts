import type { Pokemon } from '../pokemon.js';
import type { AgentAction, WeatherType } from '../types.js';
export interface StealthRockView {
    self: boolean;
    opponent: boolean;
}
export interface BattleFieldView {
    weather: WeatherType | null;
    weatherTurnsLeft: number;
    trickRoom: boolean;
    trickRoomTurnsLeft: number;
    stealthRock: StealthRockView;
}
export interface BattleContext {
    turn: number;
    self: Pokemon;
    selfTeam: Pokemon[];
    opponent: Pokemon;
    opponentTeam: Pokemon[];
    field: BattleFieldView;
    recentLog: string[];
}
export interface AgentDecision {
    action: AgentAction;
    reasoning?: string;
}
export interface BattleAgent {
    selectLead(team: Pokemon[]): Promise<Pokemon>;
    selectAction(context: BattleContext): Promise<AgentDecision>;
}
export interface LegalActions {
    moves: {
        index: number;
        move: Pokemon['moves'][number];
    }[];
    switches: {
        index: number;
        pokemon: Pokemon;
    }[];
}
export declare function getLegalActions(context: BattleContext): LegalActions;
export declare class RandomBattleAgent implements BattleAgent {
    selectLead(team: Pokemon[]): Promise<Pokemon>;
    selectAction(context: BattleContext): Promise<AgentDecision>;
}
//# sourceMappingURL=battle-agent.d.ts.map