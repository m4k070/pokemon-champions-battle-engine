
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// あくびの実挙動を数える: 撃った回数 / 空振り(すでにねむけ) / ねむけ付与 / 実際に眠った / 交代で解除
const c = { used: 0, wasted: 0, drowsy: 0, slept: 0, blockedStatus: 0, sleepTurns: [] as number[], switchedOut: 0 };

async function main() {
  for (let seed = 101; seed <= 120; seed++) {
    for (const a of META_TEAMS) {
      for (const b of META_TEAMS) {
        if (a.name === b.name || a.name === 'メガジュペッタ構築' || b.name === 'メガジュペッタ構築') continue;
        // あくびを持つ構築同士だけに絞らず、全組み合わせを回す（あくび側は hippowdon 持ち）。
        const teamA = selectTeamWithPlan(a, teamToPokemons(a)).members;
        const teamB = selectTeamWithPlan(b, teamToPokemons(b)).members;
        const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
        const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
        const leadA = await agentA.selectLead(teamA);
        const leadB = await agentB.selectLead(teamB);
        const result = await runBattle(teamA, teamB, agentA, agentB, {
          maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
        });
        const log = String(result.log).split('\n');
        for (let i = 0; i < log.length; i++) {
          const line = log[i]!;
          if (line.endsWith('のあくび')) c.used++;
          if (line.includes('はすでにねむけている')) c.wasted++;
          if (line.includes('はねむけを誘われた')) c.drowsy++;
          if (line.includes('ねむけの効果で眠ってしまった')) c.slept++;
          if (line.includes('効果がなかった') ) c.blockedStatus++;
          const m = line.match(/眠り続けている（残り(\d+)ターン）/);
          if (m) c.sleepTurns.push(Number(m[1]));
        }
      }
    }
  }
  const avg = c.sleepTurns.length ? (c.sleepTurns.reduce((x, y) => x + y, 0) / c.sleepTurns.length) : 0;
  console.log(`あくび使用 ${c.used} / 空振り(すでにねむけ) ${c.wasted} / ねむけ付与 ${c.drowsy} / 実際に眠った ${c.slept} / 無効(状態異常) ${c.blockedStatus}`);
  console.log(`眠り残ターンの平均 ${avg.toFixed(2)} (n=${c.sleepTurns.length})`);
  console.log(`空振り率 ${((c.wasted / Math.max(1, c.used)) * 100).toFixed(1)}% 睡眠成功率 ${((c.slept / Math.max(1, c.drowsy)) * 100).toFixed(1)}%`);
}
main();
