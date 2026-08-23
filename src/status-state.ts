import type { StatusCondition } from './types.js';

// ねむりの残りターン・猛毒の経過ターンは、その状態のときにだけ存在する値なので、
// 状態の種類ごとに持たせる。これにより「やけどなのに残りターンがある」といった
// 意味を持たない組み合わせが型として作れなくなる。
// StatusCondition に状態を追加すると、既定では付随データを持たない状態として扱われる。
type PlainStatusCondition = Exclude<StatusCondition, 'sleep' | 'badly-poisoned'>;

export type StatusState =
  | { kind: 'none' }
  | { kind: PlainStatusCondition }
  | { kind: 'sleep'; turnsLeft: number }
  | { kind: 'badly-poisoned'; elapsedTurns: number };

// 状態異常なし。値を持たないため定数として共有できる。
export const NO_STATUS: StatusState = { kind: 'none' };

// ねむりが継続するターン数の範囲（本編は1〜3ターン）。
const SLEEP_MIN_TURNS = 1;
const SLEEP_MAX_TURNS = 3;

// 状態異常を受けた直後の状態を作る。
// ねむりの継続ターンは乱数で決まり、猛毒の経過ターンは0から数え始める。
export function createStatusState(status: StatusCondition): StatusState {
  if (status === 'sleep') {
    const turnsLeft = SLEEP_MIN_TURNS + Math.floor(Math.random() * (SLEEP_MAX_TURNS - SLEEP_MIN_TURNS + 1));
    return { kind: 'sleep', turnsLeft };
  }
  if (status === 'badly-poisoned') {
    return { kind: 'badly-poisoned', elapsedTurns: 0 };
  }
  return { kind: status };
}

// 状態異常の種類だけを取り出す（状態異常でなければ null）。
export function statusConditionOf(state: StatusState): StatusCondition | null {
  return state.kind === 'none' ? null : state.kind;
}

// スナップショット等で複製する。
// オブジェクトスプレッドは union を分配せず判別子が潰れるため、種類ごとに作り直す。
export function cloneStatusState(state: StatusState): StatusState {
  if (state.kind === 'sleep') {
    return { kind: 'sleep', turnsLeft: state.turnsLeft };
  }
  if (state.kind === 'badly-poisoned') {
    return { kind: 'badly-poisoned', elapsedTurns: state.elapsedTurns };
  }
  return { kind: state.kind };
}
