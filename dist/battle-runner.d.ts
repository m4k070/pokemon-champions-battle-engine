import { BattleEngine } from './battle-engine.js';
import type { Pokemon } from './pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './ai/battle-agent.js';
import type { BattleSnapshot } from './battle-snapshot.js';
export interface TurnReasoning {
    turn: number;
    side: 0 | 1;
    pokemonName: string;
    reasoning?: string;
}
export interface BattleResult {
    winner: 0 | 1 | null;
    turns: number;
    log: string;
    reasoningLog: TurnReasoning[];
}
export interface StartSessionOptions {
    leadA?: Pokemon;
    leadB?: Pokemon;
    engine?: BattleEngine;
}
export declare class BattleSession {
    engine: BattleEngine;
    teamA: Pokemon[];
    teamB: Pokemon[];
    activeA: Pokemon;
    activeB: Pokemon;
    reasoningLog: TurnReasoning[];
    private turnBegun;
    private constructor();
    static start(teamA: Pokemon[], teamB: Pokemon[], options?: StartSessionOptions): Promise<BattleSession>;
    static fromSnapshot(snapshot: BattleSnapshot): BattleSession;
    snapshot(): BattleSnapshot;
    restore(snapshot: BattleSnapshot): void;
    fork(): BattleSession;
    isFinished(): boolean;
    winner(): 0 | 1 | null;
    needsForcedSwitch(side: 0 | 1): boolean;
    getContext(side: 0 | 1): BattleContext;
    beginTurn(): void;
    applyForcedSwitch(side: 0 | 1, decision: AgentDecision): void;
    applyTurn(decisionA: AgentDecision, decisionB: AgentDecision): void;
    endTurn(): void;
    playTurn(agentA: BattleAgent, agentB: BattleAgent): Promise<void>;
}
export declare class BattleHistory {
    session: BattleSession;
    private past;
    private future;
    constructor(session: BattleSession);
    canUndo(): boolean;
    canRedo(): boolean;
    checkpoint(): void;
    playTurn(agentA: BattleAgent, agentB: BattleAgent): Promise<void>;
    undo(): void;
    redo(): void;
    fork(): BattleHistory;
}
export interface RunBattleOptions extends StartSessionOptions {
    maxTurns?: number;
}
export declare function runBattle(teamA: Pokemon[], teamB: Pokemon[], agentA: BattleAgent, agentB: BattleAgent, options?: RunBattleOptions): Promise<BattleResult>;
//# sourceMappingURL=battle-runner.d.ts.map