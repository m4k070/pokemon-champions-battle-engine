import { readFileSync } from 'node:fs';
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { makeVectorEvaluator, valueInputs } from '../src/ai/value-function.js';
import type { TreeModel } from '../src/ai/value-function.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';

// 2つの V の直接対戦（value-ab.ts は v1 相手専用）。
// --challenger=木.json を、--incumbent=木.json（省略時は src/ai/value-trees.json）と戦わせる。
// 探索の設定（mode / margin）は両者で同じにし、木だけを変える。側と乱数の割当は入れ替えて相殺する。
function wilson(wins: number, total: number): [number, number] {
  if (total === 0) return [0, 100];
  const p = wins / total;
  const z = 1.96;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [100 * (center - margin), 100 * (center + margin)];
}

function arg(name: string, fallback: string): string {
  return (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=').slice(1).join('=');
}

function loadEvaluator(path: string) {
  const evaluate = makeVectorEvaluator(JSON.parse(readFileSync(path, 'utf8')) as TreeModel, path);
  return (context: Parameters<typeof valueInputs>[0]) => evaluate(valueInputs(context));
}

async function main(): Promise<void> {
  const challengerPath = arg('challenger', '');
  if (challengerPath === '') {
    console.error('--challenger=木.json が必要');
    process.exit(1);
  }
  const incumbentPath = arg('incumbent', 'src/ai/value-trees.json');
  const splitArg = arg('split', 'report') as 'tune' | 'report' | 'train';
  const margin = Number(arg('margin', '0'));
  const mode = arg('mode', 'uniform') as 'uniform' | 'worst' | 'maximin';
  const builds = Number(arg('builds', '0'));
  const challenger = loadEvaluator(challengerPath);
  const incumbent = loadEvaluator(incumbentPath);

  let entries = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  entries = entries.slice(0, builds > 0 ? builds : undefined);
  let wins = 0, losses = 0, draws = 0;
  const perBuild = new Map<string, { wins: number; total: number }>();
  const started = Date.now();

  for (const entry of entries) {
    for (const seed of splitSeeds(splitArg)) {
      for (const challengerIsA of [true, false]) {
        const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const a = new ValueSearchBattleAgent(new SeededRandom(seed * 31 + (challengerIsA ? 1 : 2)), { opponentMode: mode, trustMargin: margin, evaluate: challenger });
        const b = new ValueSearchBattleAgent(new SeededRandom(seed * 31 + (challengerIsA ? 2 : 1)), { opponentMode: mode, trustMargin: margin, evaluate: incumbent });
        const result = await runBattle(
          teamA, teamB,
          challengerIsA ? a : b,
          challengerIsA ? b : a,
          { maxTurns: 50, rng: new SeededRandom(seed * 31 + 3 + (challengerIsA ? 0 : 500)), information: 'partial', leadA: teamA[0], leadB: teamB[0] },
        );
        const stat = perBuild.get(entry.name) ?? { wins: 0, total: 0 };
        stat.total++;
        if (result.winner === null) { draws++; stat.wins += 0.5; }
        else if (result.winner === (challengerIsA ? 0 : 1)) { wins++; stat.wins++; }
        else losses++;
        perBuild.set(entry.name, stat);
      }
    }
  }

  const total = wins + losses + draws;
  const score = wins + 0.5 * draws;
  const [low, high] = wilson(score, total);
  const seconds = (Date.now() - started) / 1000;
  console.log(`${challengerPath} vs ${incumbentPath}（${mode} / margin ${margin}）: ${total}試合（分 ${draws}、${seconds.toFixed(0)}秒）`);
  console.log(`挑戦者 ${(100 * score / Math.max(1, total)).toFixed(1)}%（引き分け0.5勝）  95%CI [${low.toFixed(1)}, ${high.toFixed(1)}]`);
  for (const [name, stat] of perBuild) {
    console.log(`  ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins.toFixed(1)}/${stat.total})`);
  }
}

main();
