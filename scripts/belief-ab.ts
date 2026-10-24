import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 信念ベースのみがわり評価 vs 旧評価（伏せ情報を「無い」と扱う）。
// ミラーで戦わせ、seed ごとに側を入れ替えて先攻後攻の偏りを消す。
async function main(): Promise<void> {
  const seedCount = Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=60').split('=')[1]);
  let newWins = 0, legacyWins = 0, draws = 0, games = 0, subNew = 0, subLegacy = 0;
  for (const entry of META_TEAMS) {
    if (entry.name === 'メガジュペッタ構築') continue;
    for (let seed = 101; seed < 101 + seedCount; seed++) {
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const newIsA = seed % 2 === 1;
      const mode = (process.argv.find((a) => a.startsWith('--mode=')) ?? '--mode=expectation').split('=')[1] as 'expectation' | 'off';
  const fresh = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1), { substituteScoring: mode });
      const legacy = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2), { substituteScoring: 'legacy' });
      const r = await runBattle(teamA, teamB, newIsA ? fresh : legacy, newIsA ? legacy : fresh, {
        maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0],
      });
      games++;
      for (const line of String(r.log).split('\n')) {
        if (line.includes('は身代わりを出した')) {
          if (line.startsWith(String(teamA[0]?.name ?? ''))) { /* 名前判定は不安定なので使わない */ }
        }
      }
      const winner = r.winner;
      if (winner === null) { draws++; continue; }
      const newSide = newIsA ? 0 : 1;
      if (winner === newSide) newWins++; else legacyWins++;
    }
  }
  const decided = newWins + legacyWins;
  console.log(`合計 ${games}試合（決着 ${decided}, 分 ${draws}）`);
  console.log(`信念ベース 勝率 ${(100 * newWins / Math.max(1, decided)).toFixed(1)}% (${newWins}/${decided})`);
}
main();
