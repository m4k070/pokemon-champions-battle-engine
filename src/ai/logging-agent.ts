import type { Pokemon } from '../pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './battle-agent.js';
import { extractFeatures } from './features.js';
import type { FeatureVector } from './features.js';

// 意思決定ログ。方策には影響せず、状態特徴量・選択した行動を記録するだけ。
// 「情報集合版」は方策が見ている通りの状態、「真の状態版」は相手の伏せ情報を埋めた状態。
export interface DecisionRecord {
  turn: number;
  side: 0 | 1;
  actionType: 'move' | 'switch' | 'forfeit';
  moveName: string | null;
  hasSubstitute: boolean;
  featuresInfo: FeatureVector;
  featuresTrue: FeatureVector;
}

export class LoggingBattleAgent implements BattleAgent {
  readonly records: DecisionRecord[] = [];

  constructor(
    private readonly inner: BattleAgent,
    private readonly truth: Pokemon[],
    private readonly side: 0 | 1,
  ) {}

  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return this.inner.selectLead(team);
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const decision = await this.inner.selectAction(context);
    const trueOpponent = this.truth.find((pokemon) => pokemon.name === context.opponent.name) ?? context.opponent;
    const trueWorld: BattleContext = {
      ...context,
      opponent: trueOpponent,
      opponentTeam: context.opponentTeam.map(
        (pokemon) => this.truth.find((real) => real.name === pokemon.name) ?? pokemon,
      ),
    };
    this.records.push({
      turn: context.turn,
      side: this.side,
      actionType: decision.action.type === 'switch' ? 'switch' : decision.action.type === 'forfeit' ? 'forfeit' : 'move',
      moveName:
        decision.action.type === 'move' ? (context.self.moves[decision.action.moveIndex]?.name ?? null) : null,
      hasSubstitute: context.self.substituteHP > 0,
      featuresInfo: extractFeatures(context),
      featuresTrue: extractFeatures(trueWorld),
    });
    return decision;
  }
}
