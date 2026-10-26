import { createHash } from 'node:crypto';
import type { BattleContext } from './battle-agent.js';
import { FEATURE_NAMES } from './features.js';

// 特徴量スキーマの突き合わせ。
//
// 経緯（2026-10-25）: 29列で学習した V を 77列の抽出に当てたところ、木が参照する `weather` が
// 抽出に無く、`features[name] ?? 0` が黙って 0 を埋めていた。列を取り違えても例外にならず、
// 精度だけが静かに落ちる（今回の退行調査で 2pt の差として現れた）。
// そこで「無い列は 0 で埋める」をやめ、次の3点で明示的に検出する。
//   1. V（木の features）が抽出に無い列を参照していたら、読み込み時に例外
//   2. 0 を供給してよい旧列は DECLARED_FEATURE_DEFAULTS に理由付きで宣言する（暗黙の0埋めはしない）
//   3. 学習データ（JSONL の info 列）と収集時のスキーマをハッシュで突き合わせる
//
// ハッシュは列名の集合だけを対象にする（順序は問わない。木は名前で引くため）。

export function schemaHash(names: readonly string[]): string {
  return createHash('sha256').update([...names].sort().join(',')).digest('hex').slice(0, 16);
}

export const FEATURE_SCHEMA_HASH = schemaHash(FEATURE_NAMES);

// 抽出に存在しないが、旧 V が参照する列。ここに書いたものだけ 0 を供給する。
// weather: run3 系の木（29列）は 0/1 の weather を使うが、77列の抽出では
//   種類別 one-hot（weather_rain/sun/sand/snow）+ 残りターンに置換済み。
//   現在は LEGACY_FEATURE_COMPUTERS が実値を供給するので、この 0 は
//   「ベクトルに列が無いときの最終フォールバック」としてのみ働く。
export const DECLARED_FEATURE_DEFAULTS: Readonly<Record<string, number>> = { weather: 0 };

// 抽出には無いが木が参照する旧列の供給。context から計算する（0固定ではない）。
// weather: 旧29列の weather は「何かの天候が発生中なら1」。run3 のデータでは
//   意思決定の 34.0% で立っていた（= 0固定にすると3分の1の局面で V の入力が変わる）。
//   これを 0 に潰したまま収集した run4/run5 の maximin は、天候下で劣化した専門家だった。
export const LEGACY_FEATURE_COMPUTERS: Readonly<Record<string, (context: BattleContext) => number>> = {
  weather: (context) => (context.field.weather === null ? 0 : 1),
};

// 抽出でも宣言済みデフォルトでも解決できない列名を返す（空なら健全）。
export function unresolvedFeatures(names: readonly string[]): string[] {
  const known = new Set(FEATURE_NAMES);
  return names.filter((name) => !known.has(name) && !(name in DECLARED_FEATURE_DEFAULTS));
}

// 木が参照する列を検証する。読み込み時（モジュール初期化時）に呼ぶ。
export function assertTreeSchema(names: readonly string[], source = 'value-trees'): void {
  const unknown = unresolvedFeatures(names);
  if (unknown.length > 0) {
    throw new Error(
      `${source}: 抽出に無い特徴量を参照している: ${unknown.join(', ')} ` +
        `（抽出スキーマ ${FEATURE_SCHEMA_HASH} / ${FEATURE_NAMES.length}列。` +
        `列名を変えたなら木を学習し直すか、DECLARED_FEATURE_DEFAULTS に宣言して 0 を供給する）`,
    );
  }
}

// 学習データの info 列（または収集時の1行目）が抽出スキーマと一致するか検証する。
export function assertVectorSchema(vector: Record<string, unknown>, source = 'features'): void {
  const hash = schemaHash(Object.keys(vector));
  if (hash !== FEATURE_SCHEMA_HASH) {
    const expected = new Set(FEATURE_NAMES);
    const actual = new Set(Object.keys(vector));
    const missing = FEATURE_NAMES.filter((name) => !actual.has(name));
    const extra = [...actual].filter((name) => !expected.has(name));
    throw new Error(
      `${source}: 特徴量スキーマが不一致（${hash} ≠ ${FEATURE_SCHEMA_HASH}）` +
        `  不足: [${missing.join(', ')}]  余剰: [${extra.join(', ')}]`,
    );
  }
}
