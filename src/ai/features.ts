import type { Pokemon } from '../pokemon.js';
import type { BattleContext } from './battle-agent.js';
import { damageRatio, typeMultiplier } from './heuristic-battle-agent.js';
import { ABILITY_CLASSES, abilityClassFlags } from './ability-classes.js';

// 状態の特徴量。学習用（自己対戦ログ → 勝敗）に使う数値だけを返す。
// 構築IDや種族名は入れない（構築への過学習を避ける）。すべて「自分から見た値」で、
// 左右対称に学習できるよう self/opp をペアで持つ。
//
// 2026-10-24: 膠着・持続・構築の情報を追加（29 → 76列）。
//   - 天候は 0/1 をやめて種類の one-hot にした（雨と晴れでは意味が違う）
//   - 状態異常は 0/1 をやめて種類ごとに分けた（やけど・毒・猛毒・まひ・こおり）
//   - ねむけ・やどりぎ・たべのこし・まきびし・どくびし・こだわり拘束・PP残量を追加
//   - 特性は効果クラス（天候/無効化/能力操作/接触/回復）の one-hot に集約
//   相手の特性・持ち物は、判明しているときだけ値が入る（不完全情報モード）

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

// 状態異常の種類（0/1）。眠りは sleep_left_* が持つのでここには入れない。
function statusFlags(pokemon: Pokemon): { burn: number; poison: number; toxic: number; paralysis: number; freeze: number } {
  const kind = pokemon.statusState.kind;
  return {
    burn: kind === 'burn' ? 1 : 0,
    poison: kind === 'poison' ? 1 : 0,
    toxic: kind === 'badly-poisoned' ? 1 : 0,
    paralysis: kind === 'paralysis' ? 1 : 0,
    freeze: kind === 'freeze' ? 1 : 0,
  };
}

function toxicElapsed(pokemon: Pokemon): number {
  return pokemon.statusState.kind === 'badly-poisoned' ? pokemon.statusState.elapsedTurns : 0;
}

// PP残量比。平均26ターンの試合でPP切れが勝敗に効くため、残量そのものを持たせる。
function ppStats(pokemon: Pokemon): { min: number; sum: number } {
  if (pokemon.moves.length === 0) return { min: 0, sum: 0 };
  let minRatio = 1;
  let remaining = 0;
  let total = 0;
  for (const move of pokemon.moves) {
    const max = move.maxPP > 0 ? move.maxPP : 1;
    minRatio = Math.min(minRatio, move.pp / max);
    remaining += move.pp;
    total += max;
  }
  return { min: minRatio, sum: total > 0 ? remaining / total : 0 };
}

function itemFlags(item: Pokemon['item']): { leftover: number; choice: number; sash: number; other: number } {
  const name = item ?? '';
  const isChoice = name.startsWith('choice-');
  return {
    leftover: name === 'leftovers' ? 1 : 0,
    choice: isChoice ? 1 : 0,
    sash: name === 'focus-sash' ? 1 : 0,
    other: name !== '' && name !== 'leftovers' && name !== 'focus-sash' && !isChoice ? 1 : 0,
  };
}

function weatherFlags(context: BattleContext): { rain: number; sun: number; sand: number; hail: number } {
  const weather = context.field.weather;
  return {
    rain: weather === 'rain' ? 1 : 0,
    sun: weather === 'sun' ? 1 : 0,
    sand: weather === 'sand' ? 1 : 0,
    hail: weather === 'hail' ? 1 : 0,
  };
}

export function extractFeatures(context: BattleContext): FeatureVector {
  const { self, opponent } = context;
  const outgoing = bestOutgoing(self, opponent, context);
  const incoming = bestIncoming(opponent, self, context);
  const selfStatus = statusFlags(self);
  const oppStatus = statusFlags(opponent);
  const selfItems = itemFlags(self.item);
  const oppItems = itemFlags(opponent.item);
  const selfPp = ppStats(self);
  const weather = weatherFlags(context);
  const selfAbility = abilityClassFlags(self.ability);
  const oppAbility = abilityClassFlags(opponent.ability);
  // 相手の特性が判明しているか（未判明は 'none' に潰されている）。
  const oppAbilityKnown = opponent.ability !== 'none' ? 1 : 0;

  const features: FeatureVector = {
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
    terrain: context.field.terrain === null ? 0 : 1,
    trick_room: context.field.trickRoom ? 1 : 0,
    rock_self: context.field.stealthRock.self ? 1 : 0,
    rock_opp: context.field.stealthRock.opponent ? 1 : 0,
    // タイプ相性だけの指標（技構成に依存しない、相手の型が未知でも効く弱い特徴）
    type_advantage: Math.max(
      0,
      ...self.moves.map((move) => typeMultiplier(move.type, opponent.types)),
    ),

    // --- 天候の種類 ---
    weather_rain: weather.rain,
    weather_sun: weather.sun,
    weather_sand: weather.sand,
    weather_hail: weather.hail,
    weather_turns_left: context.field.weather === null ? 0 : context.field.weatherTurnsLeft,

    // --- 状態異常の種類 ---
    status_burn_self: selfStatus.burn,
    status_burn_opp: oppStatus.burn,
    status_poison_self: selfStatus.poison,
    status_poison_opp: oppStatus.poison,
    status_toxic_self: selfStatus.toxic,
    status_toxic_opp: oppStatus.toxic,
    status_paralysis_self: selfStatus.paralysis,
    status_paralysis_opp: oppStatus.paralysis,
    status_freeze_self: selfStatus.freeze,
    status_freeze_opp: oppStatus.freeze,
    toxic_elapsed_self: toxicElapsed(self),
    toxic_elapsed_opp: toxicElapsed(opponent),

    // --- 持続する状態 ---
    drowsy_self: self.isDrowsy ? 1 : 0,
    drowsy_opp: opponent.isDrowsy ? 1 : 0,
    seeded_self: self.isSeeded ? 1 : 0,
    seeded_opp: opponent.isSeeded ? 1 : 0,
    leftovers_self: selfItems.leftover,
    leftovers_opp: oppItems.leftover,

    // --- 設置（層数を正規化） ---
    spikes_self: context.field.spikes.self / 3,
    spikes_opp: context.field.spikes.opponent / 3,
    toxic_spikes_self: context.field.toxicSpikes.self / 2,
    toxic_spikes_opp: context.field.toxicSpikes.opponent / 2,

    // --- 持ち物・拘束 ---
    choice_locked_self: self.lockedMove === null ? 0 : 1,
    item_leftovers_self: selfItems.leftover,
    item_choice_self: selfItems.choice,
    item_sash_self: selfItems.sash,
    item_other_self: selfItems.other,
    item_leftovers_opp: oppItems.leftover,
    item_choice_opp: oppItems.choice,
    item_sash_opp: oppItems.sash,
    item_other_opp: oppItems.other,

    // --- PP残量（自分だけ観測できる） ---
    pp_min_self: selfPp.min,
    pp_sum_self: selfPp.sum,

    // --- 特性（効果クラス） ---
    ability_known_opp: oppAbilityKnown,
  };

  for (const cls of ABILITY_CLASSES) {
    features[`ability_${cls}_self`] = selfAbility[cls];
    features[`ability_${cls}_opp`] = oppAbility[cls];
  }

  return features;
}
