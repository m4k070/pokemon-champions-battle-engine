
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 眠りの実効ターン数: 眠った回数と、眠って動けなかった回数から出す。
const c = { games: 0, starts: 0, skips: 0, wakes: 0, drowsy: 0 };
const names = META_TEAMS.map((t) => t.name);

for (let i = 0; i < names.length; i++) {
  for (let j = 0; j < names.length; j++) {
    if (i === j) continue;
    const a = META_TEAMS[i]!;
    const b = META_TEAMS[j]!;
    const teamA = selectTeamWithPlan(a, teamToPokemons(a)).members;
    const teamB = selectTeamWithPlan(b, teamToPokemons(b)).members;
    const agentA = new HeuristicBattleAgent(new SeededRandom(i * 100 + j));
    const agentB = new HeuristicBattleAgent(new SeededRandom(i * 100 + j + 7));
    const leadA = await agentA.selectLead(teamA);
    const leadB = await agentB.selectLead(teamB);
    const result = await runBattle(teamA, teamB, agentA, agentB, {
      maxTurns: 300, rng: new SeededRandom(i * 1000 + j), information: 'partial', leadA, leadB,
    });
    c.games++;
    for (const line of String(result.log).split('\n')) {
      if (line.includes('眠ってしまった')) c.starts++;
      if (line.includes('は眠っている')) c.skips++;
      if (line.includes('眠りから覚めた')) c.wakes++;
      if (line.includes('ねむけを誘われた')) c.drowsy++;
    }
  }
}
console.log(`試合 ${c.games}`);
console.log(`ねむけ付与 ${c.drowsy} / 眠り発生 ${c.starts} / 動けないターン ${c.skips} / 目覚め ${c.wakes}`);
console.log(`1回の眠りで動けないターン = ${(c.skips / Math.max(1, c.starts)).toFixed(2)}`);
console.log(`ねむけ→眠りの変換率 = ${(100 * c.starts / Math.max(1, c.drowsy)).toFixed(1)}%`);
