import type { RandomSource } from '../../src/rng.js';

// 台本どおりの乱数を返す供給源。テストで「どの順に乱数を引くか」を固定するために使う。
// 値を使い切ったあとは最後の値を返し続ける（足りない分で意図せず別の分岐に入るのを防ぐ）。
export interface ScriptedRandom extends RandomSource {
  /** next() が呼ばれた回数。乱数の消費順を検証するために使う。 */
  calls(): number;
}

export function scriptedRandom(values: number[]): ScriptedRandom {
  if (values.length === 0) throw new Error('scriptedRandom: 値を1つ以上渡してください');

  let index = 0;
  let count = 0;

  return {
    next(): number {
      count++;
      const value = values[Math.min(index, values.length - 1)];
      index++;
      return value;
    },
    // 再現できない供給源として扱う（スナップショットには載らない）。
    getState: () => null,
    setState: () => {},
    calls: () => count,
  };
}

// 常に同じ値を返す供給源。乱数に依存しない比較をしたいときに使う。
export function fixedRandom(value = 0.5): ScriptedRandom {
  return scriptedRandom([value]);
}
