import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { extractFeatures, FEATURE_NAMES } from '../src/ai/features.js';
import {
  assertTreeSchema,
  assertVectorSchema,
  DECLARED_FEATURE_DEFAULTS,
  FEATURE_SCHEMA_HASH,
  schemaHash,
  unresolvedFeatures,
} from '../src/ai/feature-schema.js';
import { makeVectorEvaluator, valueInputs } from '../src/ai/value-function.js';

// 学習済みの木はエンジンに含めないので、旧列 weather を参照する小さな木で確かめる。
// type_advantage <= 0.5 なら logit -0.5、そうでなければ +0.5。
const evaluateVector = makeVectorEvaluator(
  { features: ['turn', 'weather', 'type_advantage'], trees: [[{ f: 2, t: 0.5, l: 1, r: 2 }, { v: -0.5 }, { v: 0.5 }]] },
  'テスト用の木',
);

// 特徴量スキーマのガード。29列で学習した木を77列の抽出に当てたとき、存在しない列
// （weather）が黙って 0 で埋められていた事故（2026-10-25）を二度と通さないための固定。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const mon = (name: string): Pokemon =>
  new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: stats,
    moves: [createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
  });

async function sample(): Promise<Record<string, number>> {
  const session = await BattleSession.start([mon('A')], [mon('B')], { information: 'partial', rng: new SeededRandom(1) });
  return extractFeatures(session.getContext(0));
}

describe('特徴量スキーマ', () => {
  test('FEATURE_NAMES は抽出結果と順序まで一致する（86列）', async () => {
    const features = await sample();
    expect(Object.keys(features)).toEqual([...FEATURE_NAMES]);
    expect(FEATURE_NAMES).toHaveLength(86);
  });

  test('列名は重複しない', () => {
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_NAMES.length);
  });

  test('スキーマのハッシュは列の集合だけで決まる（順序に依存しない）', () => {
    expect(schemaHash(FEATURE_NAMES)).toBe(FEATURE_SCHEMA_HASH);
    expect(schemaHash([...FEATURE_NAMES].reverse())).toBe(FEATURE_SCHEMA_HASH);
    expect(schemaHash(FEATURE_NAMES.slice(1))).not.toBe(FEATURE_SCHEMA_HASH);
  });
});

describe('木と抽出の突き合わせ', () => {
  test('旧 V が参照する旧列 weather は宣言済みで、未解決列は無い', () => {
    // run3 の木は 0/1 の weather を使う。抽出は種類別 one-hot に置換済みなので、
    // 0 を供給することを DECLARED_FEATURE_DEFAULTS で明示している。
    expect(DECLARED_FEATURE_DEFAULTS.weather).toBe(0);
    expect(unresolvedFeatures(['turn', 'weather', 'type_advantage'])).toEqual([]);
  });

  test('抽出にも宣言にも無い列を参照する木は読み込み時に落ちる', () => {
    expect(() => assertTreeSchema(['turn', 'weather_v2'], 'テスト')).toThrow(/weather_v2/);
    expect(() => assertTreeSchema(['turn', 'weather'], 'テスト')).not.toThrow();
  });

  test('列が欠けたベクトルで評価すると例外になる（黙って0埋めしない）', async () => {
    const features = await sample();
    expect(() => evaluateVector(features)).not.toThrow();

    const missing = { ...features };
    delete missing['type_advantage'];
    expect(() => evaluateVector(missing)).toThrow(/type_advantage/);

    // 抽出から列ごと消えた状態（旧 V を新しい抽出に当てた場合と同じ形）
    expect(() => evaluateVector({})).toThrow();
  });

  test('木の走査は葉の値の和をシグモイドに通す', () => {
    expect(evaluateVector({ turn: 1, weather: 0, type_advantage: 1 })).toBeCloseTo(1 / (1 + Math.exp(-0.5)), 12);
    expect(evaluateVector({ turn: 1, weather: 0, type_advantage: 0 })).toBeCloseTo(1 / (1 + Math.exp(0.5)), 12);
  });

  test('宣言済みの列だけが 0 で補われる', async () => {
    const features = await sample();
    const vector = { ...features };
    // weather は抽出に無いが宣言済みなので、無くても評価できる。
    expect(() => evaluateVector(vector)).not.toThrow();
  });

  test('木が参照する旧列 weather は context から実値で供給される（0固定にしない）', async () => {
    const session = await BattleSession.start([mon('A')], [mon('B')], { information: 'partial', rng: new SeededRandom(1) });
    expect(valueInputs(session.getContext(0)).weather).toBe(0);

    session.engine.weather = 'sun';
    const inputs = valueInputs(session.getContext(0));
    // 旧29列の weather は「何かの天候が発生中なら1」。run3 のデータでは 34% で立っていた。
    expect(inputs.weather).toBe(1);
    expect(inputs.weather_sun).toBe(1);
  });

  test('valueInputs は学習データのスキーマではない（記録には extractFeatures を使う）', async () => {
    const session = await BattleSession.start([mon('A')], [mon('B')], { information: 'partial', rng: new SeededRandom(1) });
    // 木の入力には旧列 weather が乗るが、学習データは 77列のまま。取り違えると
    // 次世代のデータだけ列が増えるので、ここで固定しておく。
    expect(() => assertVectorSchema(valueInputs(session.getContext(0)), 'テスト')).toThrow(/weather/);
  });
});

describe('学習データのスキーマ検証', () => {
  test('抽出スキーマと一致すれば通る', async () => {
    const features = await sample();
    expect(() => assertVectorSchema(features, 'テスト')).not.toThrow();
  });

  test('列の不足・余剰を名指しして落ちる', async () => {
    const features = await sample();
    const missingColumn = { ...features };
    delete missingColumn['weather_rain'];
    expect(() => assertVectorSchema(missingColumn, 'テスト')).toThrow(/weather_rain/);

    expect(() => assertVectorSchema({ ...features, weather: 0 }, 'テスト')).toThrow(/weather/);
  });
});
