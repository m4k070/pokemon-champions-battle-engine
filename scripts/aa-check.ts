import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// A/A 試験: 同一方策どうしを戦わせて、勝率が50%に収まるか確かめる。
// ここが偏ると、以降の A/B の差はすべて疑わしくなる（計測器の校正）。

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
  let aWins = 0, bWins = 0, draws = 0;
  const perBuild = new Map<string, { wins: number; total: number }>();

  for (const entry of META_TEAMS) {
    if (entry.name === 'メガジュペッタ構築') continue;
    for (let seed = 101; seed < 101 + seeds; seed++) {
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      // 1 seed につき2試合、agent乱数の割当を入れ替える（側は固定なので「先攻側の偏り」は
      // 別途構築別に出る。ここでは agent乱数 の非対称だけを消す）。
      for (const swap of [false, true]) {
        const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + (swap ? 2 : 1)));
        const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + (swap ? 1 : 2)));
        const result = await runBattle(teamA, teamB, agentA, agentB, {
          maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0],
        });
        const stat = perBuild.get(entry.name) ?? { wins: 0, total: 0 };
        stat.total++;
        if (result.winner === null) draws++;
        else if (result.winner === 0) { aWins++; stat.wins++; }
        else bWins++;
        perBuild.set(entry.name, stat);
      }
    }
  }

  const decided = aWins + bWins;
  const [low, high] = wilson(aWins, decided);
  console.log(`A/A: ${decided}試合（分 ${draws}）  A勝ち ${aWins} / B勝ち ${bWins}`);
  console.log(`A側勝率 ${(100 * aWins / Math.max(1, decided)).toFixed(1)}%  95%CI [${low.toFixed(1)}, ${high.toFixed(1)}]`);
  console.log('構築別（A側=先攻側の勝率）:');
  for (const [name, stat] of perBuild) {
    console.log(`  ${name}: ${(100 * stat.wins / Math.max(1, stat.total)).toFixed(1)}% (${stat.wins}/${stat.total})`);
  }
}

main();
