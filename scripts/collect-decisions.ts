import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';
import { getLegalActions } from '../src/ai/battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { RandomBattleAgent } from '../src/ai/random-battle-agent.js';
import { LoggingBattleAgent } from '../src/ai/logging-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { FEATURE_NAMES } from '../src/ai/features.js';
import { assertVectorSchema, FEATURE_SCHEMA_HASH } from '../src/ai/feature-schema.js';
import { appendFileSync, writeFileSync } from 'node:fs';

// 自己対戦ログの収集。1行 = 1意思決定。
// ラベルは「その側が最終的に勝ったか」。学習時は試合単位で分割すること（同一試合の状態が
// 訓練と検証に混ざるとリークする）。
//
// 使い方: npx tsx scripts/collect-decisions.ts --games=10 --out=/path/to/decisions.jsonl

const gamesArg = Number((process.argv.find((a) => a.startsWith('--games=')) ?? '--games=10').split('=')[1]);
const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=decisions.jsonl').split('=')[1]!;

const round = (value: number): number => Math.round(value * 1000) / 1000;
// どの V で学習したデータかを残す（expert iteration の世代管理）。
const VERSION = (process.argv.find((a) => a.startsWith('--v=')) ?? '--v=v3').split('=')[1]!;

// 一定確率でランダムな合法手を打つ摂動版（評価プールと同じ趣旨）。
class EpsilonAgent implements BattleAgent {
  constructor(private readonly inner: BattleAgent, private readonly rng: SeededRandom, private readonly epsilon: number) {}
  async selectLead(team: Parameters<BattleAgent['selectLead']>[0]) { return this.inner.selectLead(team); }
  async selectAction(context: Parameters<BattleAgent['selectAction']>[0]): Promise<Awaited<ReturnType<BattleAgent['selectAction']>>> {
    if (this.rng.next() >= this.epsilon) return this.inner.selectAction(context);
    const legal = getLegalActions(context);
    const total = legal.moves.length + legal.switches.length;
    if (total === 0) return { action: { type: 'forfeit' } };
    const pick = Math.min(total - 1, Math.floor(this.rng.next() * total));
    if (pick < legal.moves.length) return { action: { type: 'move', moveIndex: legal.moves[pick]!.index, target: 0 } };
    return { action: { type: 'switch', pokemonIndex: legal.switches[pick - legal.moves.length]!.index } };
  }
}

async function main(): Promise<void> {
  writeFileSync(out, '');
  // 収集時のスキーマを残す。学習側（export_trees.py）が列ハッシュを突き合わせるので、
  // 「どの列で集めたデータか」を取り違えたまま学習することがなくなる。
  const schemaPath = out.replace(/\.jsonl$/i, '') + '.schema.json';
  writeFileSync(
    schemaPath,
    JSON.stringify({ hash: FEATURE_SCHEMA_HASH, columns: FEATURE_NAMES.length, names: FEATURE_NAMES, v: VERSION }) + '\n',
  );
  let schemaChecked = false;
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
        // どの方策の下での記録かを policy タグで残す（後から除外実験ができるように）。
        const kind = seed % 4;
        const make = (side: 0 | 1): { agent: BattleAgent; policy: string } => {
          const rng = new SeededRandom(seed * 31 + side + 1);
          const isFirst = side === 0;
          if (kind === 0) return { agent: new HeuristicV1BattleAgent(rng), policy: 'baseline' };
          if (kind === 1) {
            return isFirst === (seed % 2 === 0)
              ? { agent: new ValueSearchBattleAgent(rng, { trustMargin: 0.05 }), policy: 'maximin' }
              : { agent: new HeuristicV1BattleAgent(rng), policy: 'baseline' };
          }
          if (kind === 2) {
            return isFirst
              ? { agent: new EpsilonAgent(new HeuristicV1BattleAgent(rng), rng, 0.1), policy: 'baseline-eps' }
              : { agent: new HeuristicV1BattleAgent(rng), policy: 'baseline' };
          }
          return isFirst ? { agent: new RandomBattleAgent(rng), policy: 'random' } : { agent: new HeuristicV1BattleAgent(rng), policy: 'baseline' };
        };
        const madeA = make(0);
        const madeB = make(1);
        const logA = new LoggingBattleAgent(madeA.agent, teamB, 0);
        const logB = new LoggingBattleAgent(madeB.agent, teamA, 1);
        const policies: [string, string] = [madeA.policy, madeB.policy];
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
            if (!schemaChecked) {
              // 抽出列がスキーマからずれていたら、その場で止める（数千試合を回した後の精度低下より安い）。
              assertVectorSchema(record.featuresInfo, 'collect-decisions');
              schemaChecked = true;
            }
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
              policy: policies[record.side],
              vVersion: VERSION,
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
