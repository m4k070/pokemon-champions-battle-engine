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
  moves: { index: number; move: Pokemon['moves'][number] }[];
  switches: { index: number; pokemon: Pokemon }[];
}

// PP切れ・こだわり系拘束・瀕死を踏まえた合法手の一覧。
// RandomBattleAgentとLLM系エージェント双方が同じ判定ロジックに乗るための共通ヘルパー。
export function getLegalActions(context: BattleContext): LegalActions {
  const moves = context.self.isFainted
    ? []
    : context.self.moves
        .map((move, index) => ({ move, index }))
        .filter(({ move, index }) => move.pp > 0 && context.self.canUseMove(index))
        .map(({ move, index }) => ({ index, move }));

  const switches = context.selfTeam
    .map((pokemon, index) => ({ pokemon, index }))
    .filter(({ pokemon }) => !pokemon.isFainted && pokemon !== context.self);

  return { moves, switches };
}

// PP切れ・こだわり系拘束を踏まえて合法手からランダムに選ぶ既定のエージェント。
// 高速・決定論的な検証用途（大量のアーキタイプ対戦など）にはこちらを使う。
export class RandomBattleAgent implements BattleAgent {
  async selectLead(team: Pokemon[]): Promise<Pokemon> {
    return team[0];
  }

  async selectAction(context: BattleContext): Promise<AgentDecision> {
    const { moves, switches } = getLegalActions(context);

    if (moves.length === 0) {
      if (switches.length === 0) {
        return { action: { type: 'forfeit' } };
      }
      return { action: { type: 'switch', pokemonIndex: switches[0].index } };
    }

    const { index } = moves[Math.floor(Math.random() * moves.length)];
    return { action: { type: 'move', moveIndex: index, target: 0 } };
  }
}
