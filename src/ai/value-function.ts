// 学習済みの勝率予測。
//
// 線形（ロジスティック回帰）は log-loss 0.530 / AUC 0.805 だったが、LightGBM は
// 0.443 / 0.877 まで上がる（試合単位の交差検証）。差のほとんどは
// 交互作用で、手で設計した交互作用を足しても 0.004 しか詰まらなかった。
// そこで木を JSON に書き出し、TS 側で走査する（外部依存なし）。
//
// 生成元: ~/data/pokemon-decisions/export_trees.py
//   学習データ: run4.jsonl（11,000試合 / 338,234意思決定、77特徴量。
//              baseline / maximin / baseline-eps / random を混ぜた自己対戦）
//   交差検証（試合単位 GroupKFold 5）: log-loss 0.4429 / AUC 0.8772
//   200本 × 31葉、学習率0.05。
import type { BattleContext } from './battle-agent.js';
import { extractFeatures } from './features.js';
import type { FeatureVector } from './features.js';
import treeData from './value-trees.json' with { type: 'json' };

type TreeNode = { f: number; t: number; l: number; r: number } | { v: number };

const FEATURES: string[] = treeData.features;
const TREES = treeData.trees as unknown as TreeNode[][];

// 特徴量のベクトルから勝率を出す（木の走査）。evaluateValue の本体。
export function evaluateVector(features: FeatureVector): number {
  const values = FEATURES.map((name) => features[name] ?? 0);
  let raw = 0;
  for (const nodes of TREES) {
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
}

export function evaluateValue(context: BattleContext): number {
  return evaluateVector(extractFeatures(context));
}
