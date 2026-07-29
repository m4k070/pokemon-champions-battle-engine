import type { Team } from '../team.js';
export interface TeamAnalysis {
    archetype: string;
    recommendation: string;
}
export declare class SelectionAI {
    analyzeTeam(team: Team): TeamAnalysis;
}
//# sourceMappingURL=selection-ai.d.ts.map