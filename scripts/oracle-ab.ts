import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { OracleBattleAgent } from '../src/ai/oracle-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 統制: 千里眼（相手の真の技・持ち物・特性が見える）× ミラー。
// PIMC が 42.9% だったのが「サンプリングのせい」か「情報を与えると方策が壊れる」かを切り分ける。
async function main(): Promise<void> {
  const seedCount = Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=20').split('=')[1]);
  let oracleWins = 0, heuristicWins = 0, draws = 0, games = 0;
  for (const entry of META_TEAMS) {
    if (entry.name === 'メガジュペッタ構築') continue;
    for (let seed = 101; seed < 101 + seedCount; seed++) {
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const oracleIsSideA = seed % 2 === 1;
      const oracle = new OracleBattleAgent(teamB, seed * 13 + 3);
      const heuristic = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
      const r = await runBattle(teamA, teamB, oracleIsSideA ? oracle : heuristic, oracleIsSideA ? heuristic : oracle, {
        maxTurns: 50, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0],
      });
      games++;
      if (r.winner === null) { draws++; continue; }
      const side = oracleIsSideA ? 0 : 1;
      if (r.winner === side) oracleWins++; else heuristicWins++;
    }
  }
  const decided = oracleWins + heuristicWins;
  console.log(`合計 ${games}試合（決着 ${decided}, 分 ${draws}）`);
  console.log(`千里眼 勝率 ${(100 * oracleWins / Math.max(1, decided)).toFixed(1)}% (${oracleWins}/${decided})`);
}
main();
