
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// 方策が実際にどの技を選んでいるかを数える（アブレーション候補の選定用）。
// 使われていない技は、抜いても勝率が動かない＝計測器の盲点になる。

const counts = new Map<string, number>();
const games = 11;
const seeds = [101, 202];

async function main() {
  for (const seed of seeds) {
    for (const a of META_TEAMS) {
      if (a.name === 'メガジュペッタ構築') continue;
      for (const b of META_TEAMS) {
        if (b.name === 'メガジュペッタ構築' || a.name === b.name) continue;
        const teamA = selectTeamWithPlan(a, teamToPokemons(a)).members;
        const teamB = selectTeamWithPlan(b, teamToPokemons(b)).members;
        const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
        const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
        const leadA = await agentA.selectLead(teamA);
        const leadB = await agentB.selectLead(teamB);
        const result = await runBattle(teamA, teamB, agentA, agentB, {
          maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
        });
        for (const line of String(result.log).split('\n')) {
          const m = line.match(/の(.+)$/);
          if (!m) continue;
          const name = m[1]!.trim();
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
  }
  const sorted = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  const totalGames = seeds.length * (games - 1) * (games - 1);
  console.log(`試合数 ${totalGames}`);
  for (const [name, n] of sorted.slice(0, 60)) console.log(`${n}\t${name}`);
  const watch = ['からをやぶる', 'とんぼがえり', 'バトンタッチ', 'ふいうち', 'こだわり', 'おきみやげ', 'キングシールド', 'アクアジェット', 'バレットパンチ', 'まもる', 'どくびし', 'ちょうはつ', 'アンコール', 'じこさいせい', 'なまける'];
  console.log('--- 注目技 ---');
  for (const w of watch) console.log(`${w}\t${counts.get(w) ?? 0}`);
}
main();
