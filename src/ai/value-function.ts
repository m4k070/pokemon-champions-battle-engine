// 学習済みの勝率予測（ロジスティック回帰）。
//
// 生成元: ~/data/pokemon-decisions/train_value.py（自己対戦2,188試合・65,313意思決定）。
// 方策を混ぜた（ベースライン同士 / 1手先読み vs ベースライン / ランダム vs ベースライン）。
// 交差検証（試合単位で分割）: log-loss 0.5025 / AUC 0.830 / キャリブレーション最大誤差 0.022。
// 伏せ情報を埋めた「真の状態」でも改善は log-loss 0.0031。勝敗は伏せ情報にほとんど依存しない。
import type { BattleContext } from './battle-agent.js';
import { extractFeatures } from './features.js';

const INTERCEPT = -0.31239582667753046;

const WEIGHTS: Record<string, number> = {
  turn: 0.0035579693841798336,
  hp_self: -0.023522437088306876,
  hp_opp: -0.150083842519695,
  hp_self_team: 4.492666604791464,
  hp_opp_team: -4.169859374907657,
  alive_self: -0.1768393575502018,
  alive_opp: 0.11067018207451965,
  damage_out: 1.0374242035393433,
  damage_in: -0.21820492301509006,
  matchup: 1.2708874062088829,
  ohko_out: 0.08155526637734421,
  ohko_in: -0.20261205632196322,
  speed_first: 0.032345205797272604,
  stages_self: 0.08880289296263792,
  stages_opp: -0.0993532434685324,
  status_self: -1.0965431554913465,
  status_opp: 1.0981701163841902,
  sleep_left_self: 0.30891223904918913,
  sleep_left_opp: -0.26719790534440213,
  sub_self: 1.2418776635963527,
  sub_opp: -1.4129234272623454,
  mega_self: 0.007221378284351879,
  revealed_opp_moves: 0.03854937431758413,
  weather: 0.023192091477868326,
  terrain: 0.010554725709638368,
  trick_room: 0.0,
  rock_self: -0.1013663320004652,
  rock_opp: 0.133786411344132,
  type_advantage: 0.07675874225651393,
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
