import type { Pokemon } from '../pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export interface OpenCodeBattleAgentOptions {
    apiKey?: string;
    model?: string;
    baseURL?: string;
    fetchFn?: FetchLike;
    maxRetries?: number;
}
export declare function buildBattlePrompt(context: BattleContext): string;
export declare class OpenCodeBattleAgent implements BattleAgent {
    private readonly apiKey;
    private readonly model;
    private readonly baseURL;
    private readonly fetchFn;
    private readonly maxRetries;
    private readonly fallback;
    constructor(options?: OpenCodeBattleAgentOptions);
    selectLead(team: Pokemon[]): Promise<Pokemon>;
    selectAction(context: BattleContext): Promise<AgentDecision>;
    private requestAction;
}
export {};
//# sourceMappingURL=opencode-battle-agent.d.ts.map