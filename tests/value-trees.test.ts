import { evaluateVector } from '../src/ai/value-function.js';
import parity from './fixtures/value-parity.json' with { type: 'json' };

// 木を TS に移植したので、Python（LightGBM）の予測と一致することを固定する。
// ここがずれると「学習したはずの V」ではなく別の関数で探索してしまう。
describe('移植した木の推論', () => {
  test('LightGBM の予測と一致する（200行）', () => {
    const features = parity.features as string[];
    const rows = parity.rows as number[][];
    const expected = parity.expected as number[];
    let worst = 0;
    rows.forEach((row, index) => {
      const vector: Record<string, number> = {};
      features.forEach((name, i) => {
        vector[name] = row[i]!;
      });
      const actual = evaluateVector(vector);
      worst = Math.max(worst, Math.abs(actual - expected[index]!));
    });
    expect(worst).toBeLessThan(1e-6);
  });
});
