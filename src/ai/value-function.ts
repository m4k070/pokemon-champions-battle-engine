// 学習済みの勝率予測。
//
// 線形（ロジスティック回帰）は log-loss 0.530 / AUC 0.805 だったが、LightGBM は
// 0.443 / 0.877 まで上がる（試合単位の交差検証）。差のほとんどは
// 交互作用で、手で設計した交互作用を足しても 0.004 しか詰まらなかった。
// そこで木を JSON に書き出し、TS 側で走査する（外部依存なし）。
//
// 生成元: ~/data/pokemon-decisions/make_ensemble.py（ens-29norun3、2026-10-26 昇格）
//   29列・200本×31葉の LightGBM 7本の木をつなげ、葉の値を 1/7 にしたもの（logit の平均）。
//   構成: run3b・run8b それぞれ「全試合 ×1 + 試合の9割抜き取り ×2」、run8 の全試合 ×1。
//   docs/AI_PIPELINE.md の「アンサンブル」節を参照。
import type { BattleContext } from './battle-agent.js';
import { extractFeatures } from './features.js';
import type { FeatureVector } from './features.js';
import { assertTreeSchema, DECLARED_FEATURE_DEFAULTS, LEGACY_FEATURE_COMPUTERS, FEATURE_SCHEMA_HASH } from './feature-schema.js';
import treeData from './value-trees.json' with { type: 'json' };

type TreeNode = { f: number; t: number; l: number; r: number } | { v: number };

export interface TreeModel {
  features: string[];
  trees: unknown;
}

// 木の JSON から勝率関数を作る。既定の V（value-trees.json）のほか、
// 別の木どうしを直接対戦させる評価でも使う。
export function makeVectorEvaluator(model: TreeModel, source: string): (features: FeatureVector) => number {
  const features = model.features;
  const trees = model.trees as TreeNode[][];
  // 木が参照する列は、抽出に存在するか DECLARED_FEATURE_DEFAULTS に宣言されていること。
  // ここで落ちるのは「列名を変えたのに木を学習し直していない」状態（黙って0で埋めない）。
  assertTreeSchema(features, source);
  return (vector: FeatureVector): number => {
    const values = features.map((name) => {
      const value = vector[name] ?? DECLARED_FEATURE_DEFAULTS[name];
      if (value === undefined) {
        throw new Error(
          `特徴量 ${name} が抽出結果に無い（抽出スキーマ ${FEATURE_SCHEMA_HASH} と V の参照列が不一致）`,
        );
      }
      return value;
    });

    let raw = 0;
    for (const nodes of trees) {
      let index = 0;
      for (let step = 0; step < 64; step++) {
        const node = nodes[index]!;
        if (!('f' in node)) {
          raw += node.v;
          break;
        }
        index = values[node.f]! <= node.t ? node.l : node.r;
      }
    }
    return 1 / (1 + Math.exp(-raw));
  };
}

// 特徴量のベクトルから勝率を出す（木の走査）。evaluateValue の本体。
export const evaluateVector = makeVectorEvaluator(treeData, 'src/ai/value-trees.json');

// 木に入力するベクトル。77列の抽出に、木が参照する旧列（context から計算）を足す。
// ここを飛ばすと旧 V は「天候を常に0と見る」専門家になり、天候下で手を誤る
// （run4/run5 の maximin がその状態だった）。
export function valueInputs(context: BattleContext): FeatureVector {
  const features = extractFeatures(context);
  for (const [name, compute] of Object.entries(LEGACY_FEATURE_COMPUTERS)) {
    if (!(name in features)) features[name] = compute(context);
  }
  return features;
}

export function evaluateValue(context: BattleContext): number {
  return evaluateVector(valueInputs(context));
}
