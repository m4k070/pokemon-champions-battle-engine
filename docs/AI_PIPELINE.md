# AI パイプライン（自己対戦データ → V → 対戦評価）

V（1手先読みの価値関数）の学習・評価の流れと、列スキーマの契約。数値はすべて実測。

## 流れ

```
collect-decisions.ts   → runN.jsonl + runN.schema.json   （自己対戦ログ、1行=1意思決定）
export_trees.py        → value-trees*.json + parity-check.json （LightGBM → 木のJSON）
src/ai/value-trees.json                              （採用した木をコミット）
value-ab.ts / eval-pool.ts                           （対戦での強さを測る）
```

- 収集 seed: 101–200（`splitSeeds('train')`）。報告 seed: 3001–3200（`splitSeeds('report')`）。重ねない。
- 学習データは方策を混ぜる（`seed % 4` で baseline / maximin / baseline-eps / random）。
  baseline だけだと V が「ベースラインの線」の上でしか校正されない。
- 引き分けは `label: null` で学習から除外する。評価では 0.5 勝として数える（不一致は既知）。

## 列スキーマの契約（2026-10-25 導入）

経緯: 29列で学習した V を 77列の抽出に当てたところ、木が参照する `weather` が抽出に無く、
`features[name] ?? 0` が黙って 0 を埋めていた。例外は出ず、対戦の強さだけが 2pt 落ちた。

現在の扱い:

| 場所 | 内容 |
|---|---|
| `src/ai/features.ts` | `FEATURE_NAMES`（77列の正準リスト、これが `extractFeatures` の戻り値と一致することをテストで固定） |
| `src/ai/feature-schema.ts` | `schemaHash()`（sha256(sorted(names).join(","))[:16]）、`assertTreeSchema()`、`assertVectorSchema()`、`DECLARED_FEATURE_DEFAULTS` |
| `src/ai/value-function.ts` | 木の読み込み時に参照列を検証。評価時に列が無ければ例外（0埋めしない） |
| `collect-decisions.ts` | 1行目の列を検証し、`<out>.schema.json` を書く |
| `export_trees.py` / `_subset.py` | `schema_guard.check_sidecar()` で JSONL の列と収集時ハッシュを突き合わせ、`schema` を木のJSONに記録 |

- 現行ハッシュ: `eddabac7da9ae012`（77列）。run4.jsonl もこの値（TS 側と Python 側で一致を確認）。
  run4.jsonl は sidecar 無し（ガード導入前）なので `verified: False` と記録されるが、列名ハッシュは現行と一致する。
- run3.jsonl は 29列（`2990ffc39193d0a5`）で sidecar 無し。学習時に「警告して続行」になる。
- 抽出に無い旧列は `DECLARED_FEATURE_DEFAULTS` で理由付きで宣言する。現在は `weather: 0` のみ
  （run3 の木が参照。0 を供給した状態で 82.4% / 83.1% を実測済みで、29列時代と同等）。
- 列名を変える／増やすときの手順: `features.ts` と `FEATURE_NAMES` を同時に直す → `npx jest` →
  データを新しいスキーマで集め直す → 木を学習し直す。木を残したまま列名を変えると読み込み時に落ちる（意図した挙動）。

## 現行 V の状態（2026-10-25）

- コミット済みの V は run3 学習版（29列の木）。77列の抽出に当てても
  margin0.05 で 82.4% [81.2, 83.5]、margin0 で 83.1% [82.0, 84.2]。
- run4 学習版（77列）は 80.4% / 74.1% で、退行は run4 のデータ側にある（`docs/HANDOFF-2026-10-25.md`）。
