import type { StatusCondition } from './types.js';

// 技が出せなかった／外れた理由。呼び出し側がログ文字列を読まずに原因を判別できるようにする。
export type MoveFailureReason =
  | 'no-pp'              // PPが残っていない
  | 'asleep'             // ねむりで動けない
  | 'frozen'             // こおりで動けない
  | 'paralyzed'          // まひで動けない
  | 'taunted'            // ちょうはつで攻撃技を出せない
  | 'blocked-by-ability' // 相手の特性に無効化された（ぼうだん・ひらいしん等）
  | 'missed';            // 命中判定に失敗した

// 技は出たが効果を生まなかった理由。
export type NoEffectReason =
  | 'type-immune'          // タイプ相性が0倍だった
  | 'status-immune'        // 相手が状態異常を受け付けなかった
  | 'no-applicable-effect'; // 技が対応する効果を持っていなかった（未実装の変化技）

// 技の解決結果。技が成立したかどうかと、成立した場合に何が起きたかを
// 1つの判別子（outcome）で表す。バリアントごとに意味のある値だけを持つため、
// 「失敗したのにダメージがある」といった組み合わせが型として作れない。
export type UseMoveResult =
  // 技そのものが出せなかった／外れた。
  | { outcome: 'failed'; reason: MoveFailureReason }
  // 技は出たが、相手や場に何の変化も起きなかった。
  | { outcome: 'no-effect'; reason: NoEffectReason; pivot: boolean }
  // 相手に状態異常を与えた。
  | { outcome: 'status-inflicted'; status: StatusCondition; pivot: boolean }
  // 天候・場・能力ランクなど、ダメージ以外の効果が発動した。
  | { outcome: 'effect-applied'; pivot: boolean }
  // ダメージを与えた。effectiveness はタイプ相性の倍率。
  | { outcome: 'damaged'; damage: number; effectiveness: number; pivot: boolean };

// 技が成立したか（出せなかった・外れた場合以外）。
export function isMoveSuccessful(
  result: UseMoveResult
): result is Exclude<UseMoveResult, { outcome: 'failed' }> {
  return result.outcome !== 'failed';
}

// ダメージを与えた結果か。true なら damage / effectiveness にアクセスできる。
export function isDamageResult(
  result: UseMoveResult
): result is Extract<UseMoveResult, { outcome: 'damaged' }> {
  return result.outcome === 'damaged';
}

// とんぼがえり等で、技の成立後に使用者が交代すべきか。
// 技が出せなかった場合は交代しない。
export function shouldPivotAfterMove(result: UseMoveResult): boolean {
  return isMoveSuccessful(result) && result.pivot;
}
