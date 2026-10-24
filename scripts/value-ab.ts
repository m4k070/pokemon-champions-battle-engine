import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { ValueSearchBattleAgent } from '../src/ai/value-search-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';
import { splitSeeds } from '../src/ai/eval/seeds.js';

// 1手先読み（学習した V）vs 凍結ベースライン v1。側と乱数の割当を入れ替えて相殺する。
function wilson(wins: number, total: number): [number, number] {
  if (total === 0) return [0, 100];
  const p = wins / total;
  const z = 1.96;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [100 * (center - margin), 100 * (center + margin)];
}

async function main(): Promise<void> {
  // --split=tune|report|train を渡すと、その分割の seed を使う（調整と報告を混ぜない）。
  const splitArg = (process.argv.find((a) => a.startsWith('--split=')) ?? '--split=').split('=')[1] ?? '';
  const seedsFromSplit = splitArg === '' ? null : splitSeeds(splitArg as 'tune' | 'report' | 'train');
  const seedList = seedsFromSplit ?? Array.from({ length: Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=100').split('=')[1]) }, (_, i) => 101 + i);
  const builds = Number((process.argv.find((a) => a.startsWith('--builds=')) ?? '--builds=0').split('=')[1]);
  const margin = Number((process.argv.find((a) => a.startsWith('--margin=')) ?? '--margin=0').split('=')[1]);
  const mode = ((process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=belief').split('=')[1] ?? 'belief') as
    | 'model' | 'uniform' | 'worst' | 'belief';
  let valueWins = 0, baselineWins = 0, draws = 0;
  const perBuild = new Map<string, { wins: number; total: number }>();
  const started = Date.now();
  let games = 0;

  const only = (process.argv.find((a) => a.startsWith('--build=')) ?? '--build=').split('=')[1] ?? '';
  let entries = META_TEAMS.filter((entry) => entry.name !== 'メガジュペッタ構築');
  if (only !== '') entries = entries.filter((entry) => entry.name.includes(only));
  entries = entries.slice(0, builds > 0 ? builds : undefined);

  for (const entry of entries) {
    for (const seed of seedList) {
      for (const valueIsA of [true, false]) {
        // ポケモンは試合中に書き換わるので、毎試合作り直す（使い回すと2試合目が0ターンで終わる）。
        const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const value = new ValueSearchBattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 1 : 2)), { opponentMode: mode, trustMargin: margin });
        const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + (valueIsA ? 2 : 1)));
        const result = await runBattle(
          teamA, teamB,
          valueIsA ? value : baseline,
          valueIsA ? baseline : value,
          { maxTurns: 50, rng: new SeededRandom(seed * 31 + 3 + (valueIsA ? 0 : 500)), information: 'partial', leadA: teamA[0], leadB: teamB[0] },
        );
        games++;
        const stat = perBuild.get(entry.name) ?? { wins: 0, total: 0 };
        stat.total++;
        if (result.winner === null) { draws++; stat.wins += 0.5; }
        else if (result.winner === (valueIsA ? 0 : 1)) { valueWins++; stat.wins++; }
        else baselineWins++;
        perBuild.set(entry.name, stat);
      }
    }
  }

  const decided = valueWins + baselineWins;
  const total = decided + draws;
  const score = valueWins + 0.5 * draws;
  const [low, high] = wilson(score, total);
  const seconds = (Date.now() - started) / 1000;
  console.log(`1手先読み(${mode}) vs ベースラインv1: ${total}試合（分 ${draws} = ${(100 * draws / Math.max(1, total)).toFixed(1)}%、${seconds.toFixed(0)}秒 / ${(seconds / Math.max(1, games)).toFixed(2)}秒毎試合）`);
  console.log(`1手先読み ${(100 * score / Math.max(1, total)).toFixed(1)}%（引き分け0.5勝）  95%CI [${low.toFixed(1)}, ${high.toFixed(1)}]`);
  for (const [name, stat] of perBuild) {
    console.log(`  ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins.toFixed(1)}/${stat.total})`);
  }
}

main();
