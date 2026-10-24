import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { POOL, createPoolAgent } from '../src/ai/eval/pool.js';
import type { PoolAgentName } from '../src/ai/eval/pool.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';
import { writeFileSync } from 'node:fs';

// 評価プールの総当たり。単一の相手への勝率ではなく、性格の違う相手との
// 総当たりから Bradley–Terry のレーティングを出す。引き分けは0.5勝。
//
// 使い方: npx tsx scripts/eval-pool.ts --split=report --seeds=4

const splitArg = ((process.argv.find((a) => a.startsWith('--split=')) ?? '--split=report').split('=')[1] ?? 'report') as
  | 'tune' | 'report' | 'train';
const perPair = Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=4').split('=')[1]);
const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=pool.json').split('=')[1]!;
const builds = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
const seeds = splitSeeds(splitArg).slice(0, perPair);

interface GameRow {
  a: PoolAgentName;
  b: PoolAgentName;
  score: number; // Aから見た得点（勝ち1 / 引き分け0.5 / 負け0）
  turns: number;
  draw: boolean;
}

async function main(): Promise<void> {
  const rows: GameRow[] = [];
  const started = Date.now();
  for (const a of POOL) {
    for (const b of POOL) {
      if (a === b) continue;
      for (let index = 0; index < builds.length; index++) {
        const buildA = builds[index]!;
        const buildB = builds[(index + 1) % builds.length]!;
        for (const seed of seeds) {
          const teamA = selectTeamWithPlan(buildA, teamToPokemons(buildA)).members;
          const teamB = selectTeamWithPlan(buildB, teamToPokemons(buildB)).members;
          const aIsFirst = seed % 2 === 1;
          const agentA = createPoolAgent(a, seed * 31 + 1);
          const agentB = createPoolAgent(b, seed * 31 + 2);
          const result = await runBattle(teamA, teamB, aIsFirst ? agentA : agentB, aIsFirst ? agentB : agentA, {
            maxTurns: 50,
            rng: new SeededRandom(seed * 31 + 3),
            information: 'partial',
            leadA: teamA[0],
            leadB: teamB[0],
          });
          const winner = result.winner;
          const score = winner === null ? 0.5 : winner === (aIsFirst ? 0 : 1) ? 1 : 0;
          rows.push({ a, b, score, turns: result.turns, draw: winner === null });
        }
      }
    }
  }

  // Bradley–Terry（ロジスティック回帰）を勾配上昇で当てる。
  const names = POOL;
  const index = new Map(names.map((name, i) => [name, i]));
  const fit = (data: GameRow[]): number[] => {
    const rating = new Array(names.length).fill(0);
    const lr = 0.08;
    for (let step = 0; step < 400; step++) {
      const grad = new Array(names.length).fill(0);
      for (const row of data) {
        const i = index.get(row.a)!;
        const j = index.get(row.b)!;
        const p = 1 / (1 + Math.exp(-(rating[i]! - rating[j]!)));
        const g = row.score - p;
        grad[i] += g;
        grad[j] -= g;
      }
      for (let k = 0; k < names.length; k++) rating[k] += lr * (grad[k]! / Math.max(1, data.length) - 0.001 * rating[k]!);
    }
    const mean = rating.reduce((s, v) => s + v, 0) / rating.length;
    return rating.map((v) => v - mean);
  };

  const ratings = fit(rows);
  // ブートストラップで95%区間
  const boots: number[][] = [];
  for (let b = 0; b < 200; b++) {
    const sample: GameRow[] = [];
    for (let k = 0; k < rows.length; k++) sample.push(rows[Math.floor(Math.random() * rows.length)]!);
    boots.push(fit(sample));
  }
  const ci = (i: number): [number, number] => {
    const values = boots.map((rating) => rating[i]!).sort((x, y) => x - y);
    return [values[Math.floor(values.length * 0.025)]!, values[Math.floor(values.length * 0.975)]!];
  };

  // 勝率表（行がエージェント、列が相手）
  const winRate = (a: PoolAgentName, b: PoolAgentName): { rate: number; n: number } => {
    const subset = rows.filter((row) => row.a === a && row.b === b);
    const total = subset.reduce((s, row) => s + row.score, 0);
    return { rate: total / Math.max(1, subset.length), n: subset.length };
  };

  console.log(`\n評価プール 総当たり: ${rows.length}試合 (${((Date.now() - started) / 1000).toFixed(0)}秒) split=${splitArg}`);
  console.log(`引き分け ${(100 * rows.filter((row) => row.draw).length / rows.length).toFixed(1)}%`);
  console.log('\nBradley–Terry レーティング（0が平均）:');
  const order = names.map((name, i) => ({ name, i, rating: ratings[i]! })).sort((x, y) => y.rating - x.rating);
  for (const entry of order) {
    const [low, high] = ci(entry.i);
    const vs = names.filter((name) => name !== entry.name).map((name) => winRate(entry.name, name).rate);
    const worst = Math.min(...vs);
    const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
    console.log(`  ${entry.name.padEnd(14)} ${(100 * entry.rating).toFixed(1).padStart(6)}pt  [${(100 * low).toFixed(1)}, ${(100 * high).toFixed(1)}]  平均勝率 ${(100 * mean).toFixed(1)}%  最低 ${(100 * worst).toFixed(1)}%`);
  }

  console.log('\n勝率表（行 vs 列）:');
  console.log(`  ${''.padEnd(14)}${names.map((name) => name.slice(0, 8).padStart(10)).join('')}`);
  for (const a of names) {
    const cells = names.map((b) => (a === b ? '-'.padStart(10) : `${(100 * winRate(a, b).rate).toFixed(1)}%`.padStart(10)));
    console.log(`  ${a.padEnd(14)}${cells.join('')}`);
  }

  writeFileSync(out, JSON.stringify({ split: splitArg, rows, ratings: Object.fromEntries(names.map((name, i) => [name, ratings[i]])) }, null, 1));
  console.log(`\n書き出し: ${out}`);
}

main();
