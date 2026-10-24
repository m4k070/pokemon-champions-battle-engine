import type { Pokemon } from '../pokemon.js';
import type { BattleContext } from './battle-agent.js';
import { damageRatio, typeMultiplier } from './heuristic-battle-agent.js';

// 状態の特徴量。学習用（自己対戦ログ → 勝敗）に使う数値だけを返す。
// 構築IDや種族名は入れない（構築への過学習を避ける）。すべて「自分から見た値」で、
// 左右対称に学習できるよう self/opp をペアで持つ。

export type FeatureVector = Record<string, number>;

function hpRatio(pokemon: Pokemon): number {
  return pokemon.maxHP === 0 ? 0 : pokemon.currentHP / pokemon.maxHP;
}

function teamHpRatio(team: Pokemon[]): number {
  if (team.length === 0) return 0;
  return team.reduce((sum, pokemon) => sum + (pokemon.isFainted ? 0 : hpRatio(pokemon)), 0) / team.length;
}

function stageSum(pokemon: Pokemon): number {
  return Object.values(pokemon.statStages).reduce((sum, stage) => sum + stage, 0);
}

function bestOutgoing(attacker: Pokemon, defender: Pokemon, context: BattleContext): number {
  let best = 0;
  for (const move of attacker.moves) {
    if (move.pp <= 0) continue;
    best = Math.max(best, damageRatio(attacker, defender, move, context.field));
  }
  return best;
}

function bestIncoming(attacker: Pokemon, defender: Pokemon, context: BattleContext): number {
  let best = 0;
  for (const move of attacker.moves) {
    best = Math.max(best, damageRatio(attacker, defender, move, context.field));
  }
  return best;
}

function speedOrder(self: Pokemon, opponent: Pokemon, context: BattleContext): number {
  const selfSpeed = self.stats.SPEED * (self.status === 'paralysis' ? 0.5 : 1);
  const oppSpeed = opponent.stats.SPEED * (opponent.status === 'paralysis' ? 0.5 : 1);
  if (context.field.trickRoom) return selfSpeed < oppSpeed ? 1 : -1;
  return selfSpeed > oppSpeed ? 1 : -1;
}

export function extractFeatures(context: BattleContext): FeatureVector {
  const { self, opponent } = context;
  const outgoing = bestOutgoing(self, opponent, context);
  const incoming = bestIncoming(opponent, self, context);
  return {
    turn: context.turn,
    hp_self: hpRatio(self),
    hp_opp: hpRatio(opponent),
    hp_self_team: teamHpRatio(context.selfTeam),
    hp_opp_team: teamHpRatio(context.opponentTeam),
    alive_self: context.selfTeam.filter((pokemon) => !pokemon.isFainted).length,
    alive_opp: context.opponentTeam.filter((pokemon) => !pokemon.isFainted).length,
    damage_out: outgoing,
    damage_in: incoming,
    matchup: outgoing - incoming,
    ohko_out: outgoing >= hpRatio(opponent) ? 1 : 0,
    ohko_in: incoming >= hpRatio(self) ? 1 : 0,
    speed_first: speedOrder(self, opponent, context),
    stages_self: stageSum(self),
    stages_opp: stageSum(opponent),
    status_self: self.status === null ? 0 : 1,
    status_opp: opponent.status === null ? 0 : 1,
    sleep_left_self: self.statusState.kind === 'sleep' ? self.statusState.turnsLeft : 0,
    sleep_left_opp: opponent.statusState.kind === 'sleep' ? opponent.statusState.turnsLeft : 0,
    sub_self: self.maxHP === 0 ? 0 : self.substituteHP / self.maxHP,
    sub_opp: opponent.maxHP === 0 ? 0 : opponent.substituteHP / opponent.maxHP,
    mega_self: context.canMegaEvolve ? 1 : 0,
    revealed_opp_moves: opponent.moves.length,
    weather: context.field.weather === null ? 0 : 1,
    terrain: context.field.terrain === null ? 0 : 1,
    trick_room: context.field.trickRoom ? 1 : 0,
    rock_self: context.field.stealthRock.self ? 1 : 0,
    rock_opp: context.field.stealthRock.opponent ? 1 : 0,
    // タイプ相性だけの指標（技構成に依存しない、相手の型が未知でも効く弱い特徴）
    type_advantage: Math.max(
      0,
      ...self.moves.map((move) => typeMultiplier(move.type, opponent.types)),
    ),
  };
}
