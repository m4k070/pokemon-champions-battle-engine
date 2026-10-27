import type { Pokemon } from '../pokemon.js';
import type { BattleAgent } from './battle-agent.js';
import { HeuristicV1BattleAgent } from './baselines/heuristic-v1.js';
import { runBattle } from '../battle-runner.js';
import type { RandomSource } from '../rng.js';
import { SeededRandom } from '../rng.js';

// 選出の勝率表と、その表を同時手番のゲームとして解く関数。
//
// 選出は両者が相手の6体を見てから同時に「3体＋先発」を決める読み合いなので、
// 自分の候補 × 相手の候補の総当たりを模擬対戦で埋め、混合戦略（確率で選出を混ぜる）を求める。
// 模擬対戦の方策は速い v1 どうし（1試合 1ミリ秒前後）。1マスの試合はどのマスも同じ seed 列を使い、
// マスどうしの比較の揺れを減らす。
//
// 相手の6体をどう作るか（能力値を見積もりにするか等）は呼び出し側が決める。
// 公平にするなら、相手の6体は見せ合いで見える種族から信念で組み立てる。

// 選出の候補: roster の添字の並び。先頭が先発、残り2体は添字の昇順。
export type SelectionOption = number[];

// 6体から size 体を選び、先発を決める全通り（6体・3体なら 20組 × 先発3 = 60通り）。
export function enumerateSelections(rosterSize: number, size = 3): SelectionOption[] {
  const combos: number[][] = [];
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === size) {
      combos.push(chosen);
      return;
    }
    for (let i = start; i < rosterSize; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return combos.flatMap((combo) => combo.map((lead) => [lead, ...combo.filter((index) => index !== lead)]));
}

export interface PayoffMatrixOptions {
  // 1マスあたりの試合数。
  gamesPerCell?: number;
  seed?: number;
  maxTurns?: number;
  // 模擬対戦の方策（既定は v1）。
  agent?: (rng: RandomSource) => BattleAgent;
}

export interface PayoffMatrix {
  rows: SelectionOption[];
  cols: SelectionOption[];
  // matrix[i][j]: 行の候補 i が列の候補 j と戦ったときの、行側の得点（勝ち1・引き分け0.5）の平均。
  matrix: number[][];
  games: number;
}

// 自分の6体（makeSelf）と相手の6体（makeOpponent）から勝率表を作る。
// ポケモンは試合中に書き換わるので、試合ごとに作り直せる関数で受け取る。
export async function buildPayoffMatrix(
  makeSelf: () => Pokemon[],
  makeOpponent: () => Pokemon[],
  options: PayoffMatrixOptions = {},
): Promise<PayoffMatrix> {
  const gamesPerCell = options.gamesPerCell ?? 10;
  const seed = options.seed ?? 1;
  const agent = options.agent ?? ((rng: RandomSource) => new HeuristicV1BattleAgent(rng));
  const rows = enumerateSelections(makeSelf().length);
  const cols = enumerateSelections(makeOpponent().length);
  const matrix: number[][] = [];
  for (const row of rows) {
    const scores: number[] = [];
    for (const col of cols) {
      let score = 0;
      for (let game = 0; game < gamesPerCell; game++) {
        const base = (seed + game) * 7919;
        const self = makeSelf();
        const opponent = makeOpponent();
        const teamA = row.map((index) => self[index]);
        const teamB = col.map((index) => opponent[index]);
        const result = await runBattle(teamA, teamB, agent(new SeededRandom(base + 1)), agent(new SeededRandom(base + 2)), {
          maxTurns: options.maxTurns ?? 50,
          rng: new SeededRandom(base + 3),
          information: 'partial',
          leadA: teamA[0],
          leadB: teamB[0],
        });
        score += result.winner === null ? 0.5 : result.winner === 0 ? 1 : 0;
      }
      scores.push(score / gamesPerCell);
    }
    matrix.push(scores);
  }
  return { rows, cols, matrix, games: rows.length * cols.length * gamesPerCell };
}

export interface MatrixGameSolution {
  // 行側（最大化）と列側（最小化）の混合戦略。
  row: number[];
  col: number[];
  // 行側の得点の期待値（両者が上の戦略を取ったとき）。
  value: number;
  // 相手が最善で応じたときの行側の得点（row を読まれても保証される値）。
  rowGuarantee: number;
}

// ゼロ和の行列ゲームを乗算型の重み更新（両者が互いの今の戦略に応じる）で近似的に解き、平均の戦略を返す。
// 60×60 なら数千回の反復で、保証値は均衡の値から 0.01 以内に収まる。
export function solveMatrixGame(matrix: number[][], iterations = 5000): MatrixGameSolution {
  const n = matrix.length;
  const m = matrix[0]?.length ?? 0;
  if (n === 0 || m === 0) throw new RangeError('空の勝率表は解けない');
  const etaRow = Math.sqrt((8 * Math.log(n)) / iterations);
  const etaCol = Math.sqrt((8 * Math.log(m)) / iterations);
  const logRow = new Array<number>(n).fill(0);
  const logCol = new Array<number>(m).fill(0);
  const sumRow = new Array<number>(n).fill(0);
  const sumCol = new Array<number>(m).fill(0);
  const normalize = (logs: number[]): number[] => {
    const top = Math.max(...logs);
    const weights = logs.map((value) => Math.exp(value - top));
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((value) => value / total);
  };
  for (let t = 0; t < iterations; t++) {
    const x = normalize(logRow);
    const y = normalize(logCol);
    for (let i = 0; i < n; i++) sumRow[i] += x[i];
    for (let j = 0; j < m; j++) sumCol[j] += y[j];
    for (let i = 0; i < n; i++) {
      let payoff = 0;
      for (let j = 0; j < m; j++) payoff += matrix[i][j] * y[j];
      logRow[i] += etaRow * payoff;
    }
    for (let j = 0; j < m; j++) {
      let payoff = 0;
      for (let i = 0; i < n; i++) payoff += matrix[i][j] * x[i];
      logCol[j] -= etaCol * payoff;
    }
  }
  const row = sumRow.map((value) => value / iterations);
  const col = sumCol.map((value) => value / iterations);
  let value = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) value += row[i] * matrix[i][j] * col[j];
  let rowGuarantee = Infinity;
  for (let j = 0; j < m; j++) {
    let payoff = 0;
    for (let i = 0; i < n; i++) payoff += row[i] * matrix[i][j];
    rowGuarantee = Math.min(rowGuarantee, payoff);
  }
  return { row, col, value, rowGuarantee };
}

// 混合戦略から1つ引く。
export function sampleStrategy(probabilities: number[], rng: RandomSource): number {
  let r = rng.next();
  for (let i = 0; i < probabilities.length; i++) {
    r -= probabilities[i];
    if (r < 0) return i;
  }
  return probabilities.length - 1;
}
