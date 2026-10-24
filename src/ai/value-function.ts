// 学習済みの勝率予測（ロジスティック回帰）。
//
// 生成元: ~/data/pokemon-decisions/train_value.py（自己対戦1100試合・33,639意思決定）。
// 交差検証（試合単位で分割）: log-loss 0.5755 / AUC 0.758 / キャリブレーション最大誤差 0.052。
// 伏せ情報を埋めた「真の状態」で学んでも log-loss は 0.0093 しか改善しない。
// つまり勝敗は伏せ情報にほとんど依存しておらず、弱さは情報不足ではなく方策の反応の問題。
import type { BattleContext } from './battle-agent.js';
import { extractFeatures } from './features.js';

const INTERCEPT = -0.37262826564601376;

const WEIGHTS: Record<string, number> = {
  turn: 0.0039142558107962,
  hp_self: -0.0761515557990416,
  hp_opp: -0.36354421222970024,
  hp_self_team: 2.9825415166038223,
  hp_opp_team: -2.359839694046591,
  alive_self: -0.27572953360471725,
  alive_opp: 0.13897207770828462,
  damage_out: 1.8730071026024164,
  damage_in: -0.44627697168897174,
  matchup: 2.2943022743295294,
  ohko_out: 0.2244773178335372,
  ohko_in: -0.35300978420049167,
  speed_first: -0.0500345070222186,
  stages_self: 0.026557522707974724,
  stages_opp: -0.03573125496807093,
  status_self: -1.023387069726968,
  status_opp: 1.0174540518879793,
  sleep_left_self: 0.22376669926104026,
  sleep_left_opp: -0.16850915219948037,
  sub_self: 1.554217500423743,
  sub_opp: -1.7880241552120664,
  mega_self: 0.033550978189841874,
  revealed_opp_moves: 0.05446150180970548,
  weather: 0.039303281683864086,
  terrain: -0.026419640545317213,
  trick_room: 0.0,
  rock_self: 0.25136870469129574,
  rock_opp: -0.2257465927771667,
  type_advantage: 0.14116670345391694,
};

export function evaluateValue(context: BattleContext): number {
  const features = extractFeatures(context);
  let score = INTERCEPT;
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    score += weight * (features[name] ?? 0);
  }
  // シグモイド。0..1 の勝率として返す。
  return 1 / (1 + Math.exp(-score));
}
