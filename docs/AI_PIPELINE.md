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
- 抽出に無い旧列は `LEGACY_FEATURE_COMPUTERS` が context から実値を供給する（現在 `weather` のみ）。
  `DECLARED_FEATURE_DEFAULTS` はベクトルに列が無いときの最終フォールバック（0）。
  木の入力は `valueInputs(context)` = 77列 + 旧列。**学習データの記録は `extractFeatures` の 77列のまま**
  （取り違えると次世代のデータだけ列が増える。テストで固定している）。
- `weather` を 0 固定にしていた時期がある（run4/run5 の収集）。run3 のデータでは意思決定の 34.0% で
  weather が立っていたので、その maximin は天候下で劣化した専門家だった。
- 列名を変える／増やすときの手順: `features.ts` と `FEATURE_NAMES` を同時に直す → `npx jest` →
  データを新しいスキーマで集め直す → 木を学習し直す。木を残したまま列名を変えると読み込み時に落ちる（意図した挙動）。

## 現行 V の状態（2026-10-25）

コミット済みの V は run3 学習版（29列の木）。凍結ベースラインv1 相手・report seed 3001–3200・4,400試合:

| V（学習データ／maximin の入力） | margin 0.05 | margin 0 | 引き分け |
|---|---|---|---|
| run3 学習（現行）・weather 0固定 | 82.4% [81.2, 83.5] | 83.1% [82.0, 84.2] | 6.3% / 5.2% |
| run3 学習（現行）・weather 実値 | 82.5% [81.3, 83.6] | 82.6% [81.5, 83.7] | 6.3% / 5.2% |
| run4 学習（weather 0固定の maximin） | 80.4% | 74.1% | 8.8% / 9.5% |
| run6 学習（weather 実値の maximin） | 81.5% [80.3, 82.6] | 77.5% [76.3, 78.7] | 8.1% / 7.3% |

- 現行 V は weather を 0 固定にしても実値でも強さが変わらない。
- 新しいデータで学習した V は「weather を直す」だけでは現行に届かない（run4 → run6 で +1.1/+3.4pt、
  それでも現行比 −1.0/−5.1pt）。margin0 と 0.05 の差は現行 0.1pt に対し run6 4.0pt で、
  **兄弟手の順位付け（ΔV）がまだ弱い**。原因はデータの質（H2: ラベルが混合方策の価値）側に残っている。

## V を昇格させるときの手順

1. `npx jest` が緑（現行 V のまま）であることを確認。
2. `~/data/pokemon-decisions/value-trees-vN.json` を `src/ai/value-trees.json` にコピー。
3. **`parity-check.json` を `tests/fixtures/value-parity.json` にコピーする**（学習時の 200行サンプル）。
   忘れると `tests/value-trees.test.ts` が旧い列数で落ちる（＝昇格の検出になる）。
4. `value-ab.ts --split=report` を margin 0.05 / 0 の2本。昇格条件は「v1 相手に現行を下回らない」
   「（可能なら）現行 V との直接対戦で 50% 以上」。log-loss は補助指標。

