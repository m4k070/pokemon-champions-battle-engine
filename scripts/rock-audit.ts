
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// ステルスロックの実効値: 設置回数・空振り・踏んだ回数・合計ダメージを数える。
const c = { set: 0, wasted: 0, hits: 0, damage: 0, maxHpSum: 0, games: 0 };

async function main() {
  for (let seed = 101; seed <= 120; seed++) {
    for (const a of META_TEAMS) {
      for (const b of META_TEAMS) {
        if (a.name === b.name || a.name === 'メガジュペッタ構築' || b.name === 'メガジュペッタ構築') continue;
        const teamA = selectTeamWithPlan(a, teamToPokemons(a)).members;
        const teamB = selectTeamWithPlan(b, teamToPokemons(b)).members;
        const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
        const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
        const leadA = await agentA.selectLead(teamA);
        const leadB = await agentB.selectLead(teamB);
        const result = await runBattle(teamA, teamB, agentA, agentB, {
          maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
        });
        c.games++;
        c.maxHpSum += [...teamA, ...teamB].reduce((s, p) => s + p.maxHP, 0);
        for (const line of String(result.log).split('\n')) {
          if (line.endsWith('のステルスロック')) c.set++;
          if (line.includes('既に設置されている')) c.wasted++;
          if (line.includes('ステルスロックのダメージ')) {
            c.hits++;
            const m = line.match(/のダメージ/);
            const d = line.match(/で(\d+)のダメージ/);
            if (d) c.damage += Number(d[1]);
          }
        }
      }
    }
  }
  console.log(`試合 ${c.games} / 設置 ${c.set} / 空振り ${c.wasted} / 踏んだ ${c.hits} / 合計ダメージ ${c.damage}`);
  console.log(`1試合あたり: 設置${(c.set / c.games).toFixed(2)}回 踏まれ${(c.hits / c.games).toFixed(2)}回 ダメージ${(c.damage / c.games).toFixed(0)} (全体HPの${((c.damage / c.maxHpSum) * 100).toFixed(1)}%)`);
  console.log(`1回の設置あたりの期待ダメージ ${(c.damage / Math.max(1, c.set)).toFixed(0)}`);
}
main();
