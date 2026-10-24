import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { RandomBattleAgent } from '../src/ai/random-battle-agent.js';
import { LoggingBattleAgent } from '../src/ai/logging-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { appendFileSync, writeFileSync } from 'node:fs';

// 自己対戦ログの収集。1行 = 1意思決定。
// ラベルは「その側が最終的に勝ったか」。学習時は試合単位で分割すること（同一試合の状態が
// 訓練と検証に混ざるとリークする）。
//
// 使い方: npx tsx scripts/collect-decisions.ts --games=10 --out=/path/to/decisions.jsonl

const gamesArg = Number((process.argv.find((a) => a.startsWith('--games=')) ?? '--games=10').split('=')[1]);
const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=decisions.jsonl').split('=')[1]!;

const round = (value: number): number => Math.round(value * 1000) / 1000;

async function main(): Promise<void> {
  writeFileSync(out, '');
  const builds = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  let games = 0, rows = 0, turnsTotal = 0, noDamageTurns = 0, allTurns = 0;
  const subActions = new Map<string, number>();
  let subDecisions = 0;

  for (let i = 0; i < builds.length; i++) {
    for (let j = 0; j < builds.length; j++) {
      if (i === j) continue;
      const entryA = builds[i]!;
      const entryB = builds[j]!;
      for (let seed = 101; seed < 101 + gamesArg; seed++) {
        const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
        const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
        // 方策を混ぜる。ベースライン同士だけだと V は「ベースラインの線」の上でしか
        // 較正されず、1手先読みが分布外に出た瞬間に過大評価する（実測で確認済み）。
        const kind = seed % 3;
        const make = (side: 0 | 1): BattleAgent => {
          const rng = new SeededRandom(seed * 31 + side + 1);
          if (kind === 0) return new HeuristicV1BattleAgent(rng);
          if (kind === 1) return (side === 0) === (seed % 2 === 0) ? new ValueSearchBattleAgent(rng, { trustMargin: 0.1 }) : new HeuristicV1BattleAgent(rng);
          return side === 0 ? new RandomBattleAgent(rng) : new HeuristicV1BattleAgent(rng);
        };
        const logA = new LoggingBattleAgent(make(0), teamB, 0);
        const logB = new LoggingBattleAgent(make(1), teamA, 1);
        const result = await runBattle(teamA, teamB, logA, logB, {
          maxTurns: 50,
          rng: new SeededRandom(seed * 31 + 3),
          information: 'partial',
          leadA: teamA[0],
          leadB: teamB[0],
        });
        games++;
        turnsTotal += result.turns;

        // ダメージが1件も出なかったターンの割合（膠着の検出）。
        const blocks = String(result.log).split(/===== ターン\d+開始 =====/).slice(1);
        for (const block of blocks) {
          allTurns++;
          if (!block.includes('ダメージ')) noDamageTurns++;
        }

        const lines: string[] = [];
        for (const agent of [logA, logB]) {
          const won = result.winner === agent.records[0]?.side ? 1 : 0;
          for (const record of agent.records) {
            if (record.hasSubstitute) {
              subDecisions++;
              const key = record.actionType === 'move' ? (record.moveName ?? '?') : '交代';
              subActions.set(key, (subActions.get(key) ?? 0) + 1);
            }
            const row = {
              game: `${i}-${j}-${seed}`,
              buildA: entryA.name,
              buildB: entryB.name,
              side: record.side,
              turn: record.turn,
              label: result.winner === null ? null : won,
              actionType: record.actionType,
              moveName: record.moveName,
              hasSubstitute: record.hasSubstitute,
              info: Object.fromEntries(Object.entries(record.featuresInfo).map(([k, v]) => [k, round(v)])),
              truth: Object.fromEntries(Object.entries(record.featuresTrue).map(([k, v]) => [k, round(v)])),
            };
            lines.push(JSON.stringify(row));
            rows++;
          }
        }
        appendFileSync(out, `${lines.join('\n')}\n`);
      }
    }
  }

  console.log(`試合 ${games} / 行 ${rows} / 出力 ${out}`);
  console.log(`平均ターン数 ${(turnsTotal / Math.max(1, games)).toFixed(1)}`);
  console.log(`ダメージ0のターン ${(100 * noDamageTurns / Math.max(1, allTurns)).toFixed(1)}% (${noDamageTurns}/${allTurns})`);
  const top = [...subActions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`みがわり中の意思決定 ${subDecisions} 件:`);
  for (const [name, count] of top) console.log(`  ${name}: ${count}`);
}

main();
