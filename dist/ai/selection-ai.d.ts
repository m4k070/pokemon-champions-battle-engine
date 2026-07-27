import type { MoveAction, SwitchAction, ForfeitAction } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { Team } from '../team.js';
export interface TeamAnalysis {
    archetype: string;
    recommendation: string;
}
export declare class SelectionAI {
    analyzeTeam(team: Team): TeamAnalysis;
    selectLead(team: Team): Pokemon;
    selectMove(pokemon: Pokemon, _opponent: Pokemon): MoveAction;
    selectSwitch(team: Team): SwitchAction | ForfeitAction;
}
//# sourceMappingURL=selection-ai.d.ts.map