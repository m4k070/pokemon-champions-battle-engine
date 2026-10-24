import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { HeuristicV1BattleAgent } from '../src/ai/baselines/heuristic-v1.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 現在の方策 vs 凍結ベースライン v1（同一構築ミラー、側は seed で入れ替え）。
// A/A で構築ごとに先攻側の偏りが出るため、必ず側を入れ替えて相殺する。
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
  const seeds = Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=100').split('=')[1]);
  let currentWins = 0, baselineWins = 0, draws = 0;
  const perBuild = new Map<string, { wins: number; total: number }>();

  for (const entry of META_TEAMS) {
    if (entry.name === 'メガジュペッタ構築') continue;
    for (let seed = 101; seed < 101 + seeds; seed++) {
      // 1 seed につき2試合、側と方策乱数の割当を両方入れ替えて偏りを相殺する。
      // （片方だけだと「先攻側」と「agent乱数」の非対称が数ptの系統誤差として残る）
      for (const currentIsA of [true, false]) {
        // ポケモンは試合中に書き換わるので毎試合作り直す。
        const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
        const current = new HeuristicBattleAgent(new SeededRandom(seed * 31 + (currentIsA ? 1 : 2)));
        const baseline = new HeuristicV1BattleAgent(new SeededRandom(seed * 31 + (currentIsA ? 2 : 1)));
        const result = await runBattle(
          teamA, teamB,
          currentIsA ? current : baseline,
          currentIsA ? baseline : current,
          {
            maxTurns: 300, rng: new SeededRandom(seed * 31 + 3 + (currentIsA ? 0 : 500)), information: 'partial', leadA: teamA[0], leadB: teamB[0],
          },
        );
        const stat = perBuild.get(entry.name) ?? { wins: 0, total: 0 };
        stat.total++;
        if (result.winner === null) draws++;
        else if (result.winner === (currentIsA ? 0 : 1)) { currentWins++; stat.wins++; }
        else baselineWins++;
        perBuild.set(entry.name, stat);
      }
    }
  }

  const decided = currentWins + baselineWins;
  const [low, high] = wilson(currentWins, decided);
  console.log(`現在 vs ベースラインv1: ${decided}試合（分 ${draws}）`);
  console.log(`現在 ${(100 * currentWins / Math.max(1, decided)).toFixed(1)}%  95%CI [${low.toFixed(1)}, ${high.toFixed(1)}]`);
  for (const [name, stat] of perBuild) {
    console.log(`  ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins}/${stat.total})`);
  }
}

main();
