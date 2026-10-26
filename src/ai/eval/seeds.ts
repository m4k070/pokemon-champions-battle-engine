// 評価用の seed 分割。チューニングと報告で同じ seed を使うと、選んだ設定に都合の良い
// 数字が報告値になる（2026-10-24 の margin 選定で実際に起きた）。
export interface SeedSplit {
  label: string;
  start: number;
  count: number;
}

export const SEED_SPLITS: Record<'train' | 'tune' | 'report', SeedSplit> = {
  // 学習データの収集に使う（学習用）
  train: { label: 'train', start: 101, count: 100 },
  // 設定（margin など）の選択に使う（調整用）
  tune: { label: 'tune', start: 2001, count: 100 },
  // 最終報告に使う。設定選択には絶対に使わない。
  report: { label: 'report', start: 3001, count: 200 },
};

export function splitSeeds(split: 'train' | 'tune' | 'report'): number[] {
  const { start, count } = SEED_SPLITS[split];
  return Array.from({ length: count }, (_, index) => start + index);
}
