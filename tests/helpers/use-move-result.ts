import { isDamageResult } from '../../src/use-move-result.js';
import type { UseMoveResult } from '../../src/use-move-result.js';

// ダメージを与えた結果として取り出す。別の結果なら、その場でテストを失敗させる。
// UseMoveResult は判別子で分かれているため、damage を読むには絞り込みが必要になる。
export function asDamageResult(
  result: UseMoveResult
): Extract<UseMoveResult, { outcome: 'damaged' }> {
  if (!isDamageResult(result)) {
    throw new Error(`ダメージを与えた結果を期待しましたが outcome=${result.outcome} でした`);
  }
  return result;
}
