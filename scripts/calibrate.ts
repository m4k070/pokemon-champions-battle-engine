// Stage 0b 相当の検量線（エンジン校正).
//
// 条件（docs/WORK_ORDER_2026-10-18.md の T9 検証と同じ）:
//   - ジュペッタ構築を除く11構築の全ペア 55 × seed 6 = 330試合
//   - 行動: RandomBattleAgent(SeededRandom(seed*31+1)) vs (seed*31+2)
//   - maxTurns は runBattle の既定（50）
//
// 使い方: npx tsx scripts/calibrate.ts [--json]
// 出力: 構築ごとの勝率、Tier（SS/S/A）別の対戦勝率、例外の発生数。

import { runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { writeFileSync } from 'node:fs';

// 評価画像（gamewith.jp/pokemon-champions/555537 の tier_rank_*.png alt）に基づく区分。
// ページは 2026-10-19 19:37 更新版。カタログ順とは一致しないので名前で持つ。
const TIERS: Record<string, 'SS' | 'S' | 'A'> = {
  'メガガブリアスZ構築': 'SS',
  'メガグソクムシャ構築': 'SS',
  'カバマンダ構築': 'SS',
  'メガリザードンY構築': 'SS',
  'メガカメックス構築': 'SS',
  'メガジュペッタ構築': 'S',
  'メガライチュウY構築': 'S',
  'カバルカ構築': 'S',
  'カイリューガルド構築': 'A',
  'クエスピクシー構築': 'A',
  'メガラグラージ構築': 'A',
};

const SEEDS = [101, 202, 303, 404, 505, 606];
const EXCLUDED = 'メガジュペッタ構築';

interface TeamStat {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

async function main(): Promise<void> {
  // エンジン乱数も固定するモード（前後比較の主測定）。既定は指示書どおり行動だけを固定。
  const engineSeeded = process.argv.includes('--engine-seed');
  // --agent=heuristic: ルールベース方策で回す（行動の価値を測るため）。
  const agentKind = (process.argv.find((arg) => arg.startsWith('--agent=')) ?? '--agent=random').split('=')[1];
  // --max-turns=N: 引き分け（打ち切り）を減らしたいときに使う。
  const maxTurnsArg = process.argv.find((arg) => arg.startsWith('--max-turns='));
  const maxTurns = maxTurnsArg ? Number(maxTurnsArg.split('=')[1]) : undefined;
  const makeAgent = (seed: number) => agentKind === 'heuristic'
    ? new HeuristicBattleAgent(new SeededRandom(seed))
    : new RandomBattleAgent(new SeededRandom(seed));
  const teams = META_TEAMS.filter((team) => team.name !== EXCLUDED).map((team) => ({
    name: team.name,
    entry: team,
  }));
  const stats = new Map<string, TeamStat>();
  for (const team of teams) stats.set(team.name, { games: 0, wins: 0, losses: 0, draws: 0 });

  const tierStats = new Map<string, { games: number; wins: number }>();
  const games: { a: string; b: string; seed: number; winner: 0 | 1 | null; error?: string }[] = [];
  let errors = 0;
  let totalGames = 0;

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const teamA = teams[i]!;
      const teamB = teams[j]!;
      for (const seed of SEEDS) {
        totalGames++;
        const a = stats.get(teamA.name)!;
        const b = stats.get(teamB.name)!;
        try {
          const result = await runBattle(
            teamToPokemons(teamA.entry),
            teamToPokemons(teamB.entry),
            makeAgent(seed * 31 + 1),
            makeAgent(seed * 31 + 2),
            // エンジン側（命中・急所・ダメージ揺れ・同速）も固定する。
            // 指定しないと SYSTEM_RANDOM になり、同じseedでも結果が毎回変わる。
            { ...(maxTurns !== undefined ? { maxTurns } : {}), ...(engineSeeded ? { rng: new SeededRandom(seed * 31 + 3) } : {}) },
          );
          a.games++;
          b.games++;
          games.push({ a: teamA.name, b: teamB.name, seed, winner: result.winner });
          if (result.winner === 0) {
            a.wins++;
            b.losses++;
          } else if (result.winner === 1) {
            b.wins++;
            a.losses++;
          } else {
            a.draws++;
            b.draws++;
          }
          const tierA = TIERS[teamA.name];
          const tierB = TIERS[teamB.name];
          if (tierA && tierB && tierA !== tierB) {
            for (const [from, to, winner] of [
              [tierA, tierB, 0],
              [tierB, tierA, 1],
            ] as const) {
              const key = `${from} vs ${to}`;
              const bucket = tierStats.get(key) ?? { games: 0, wins: 0 };
              bucket.games++;
              if (result.winner === winner) bucket.wins++;
              tierStats.set(key, bucket);
            }
          }
        } catch (error) {
          errors++;
          games.push({
            a: teamA.name,
            b: teamB.name,
            seed,
            winner: null,
            error: error instanceof Error ? error.message : String(error),
          });
          console.error(
            `ERROR ${teamA.name} vs ${teamB.name} seed=${seed}: ` +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }
    }
  }

  const pct = (num: number, den: number): string => (den === 0 ? '-' : `${((num / den) * 100).toFixed(1)}%`);
  console.log(`\n試合数: ${totalGames} / 例外: ${errors}`);
  console.log('\n構築別勝率（勝/試合, 引き分け）');
  const rows = teams
    .map((team) => ({ name: team.name, tier: TIERS[team.name] ?? '?', ...stats.get(team.name)! }))
    .sort((a, b) => b.wins / Math.max(b.games, 1) - a.wins / Math.max(a.games, 1));
  for (const row of rows) {
    console.log(
      `${row.tier.padEnd(2)} ${row.name.padEnd(22, '　')} ${row.wins}勝/${row.games} (${pct(row.wins, row.games)}) 分${row.draws}`,
    );
  }
  console.log('\nTier別（勝率は from 側から見た値）');
  for (const [key, value] of [...tierStats.entries()].sort()) {
    console.log(`${key}: ${value.wins}/${value.games} (${pct(value.wins, value.games)})`);
  }

  if (process.argv.includes('--json')) {
    console.log('\n' + JSON.stringify({ totalGames, errors, rows, tiers: Object.fromEntries(tierStats) }));
  }

  const dumpIndex = process.argv.indexOf('--dump');
  if (dumpIndex !== -1 && process.argv[dumpIndex + 1]) {
    writeFileSync(process.argv[dumpIndex + 1], JSON.stringify({ totalGames, errors, games }, null, 1));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
