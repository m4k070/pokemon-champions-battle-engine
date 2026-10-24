
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// みがわりが実際に何をしているか: 張った回数 / 壊れた回数 / 変化技を防いだ回数。
const c = { set: 0, broke: 0, blocked: 0, failed: 0, games: 0 };

async function main() {
  const subject = 'メガカメックス構築';
  for (let seed = 101; seed <= 120; seed++) {
    for (const other of META_TEAMS) {
      if (other.name === subject || other.name === 'メガジュペッタ構築') continue;
      const entry = META_TEAMS.find((t) => t.name === subject)!;
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(other, teamToPokemons(other)).members;
      const agentA = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 1));
      const agentB = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
      const leadA = await agentA.selectLead(teamA);
      const leadB = await agentB.selectLead(teamB);
      const result = await runBattle(teamA, teamB, agentA, agentB, {
        maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA, leadB,
      });
      c.games++;
      for (const line of String(result.log).split('\n')) {
        if (line.includes('は身代わりを出した')) c.set++;
        if (line.includes('みがわりは こわれた')) c.broke++;
        if (line.includes('は身代わりで')) c.blocked++;
        if (line.includes('うまくきまらなかった') && line.includes('みがわり')) c.failed++;
      }
    }
  }
  console.log(`試合 ${c.games} / みがわり ${c.set} (${(c.set / c.games).toFixed(2)}/試合) / 破壊 ${c.broke} / 変化技を防いだ ${c.blocked}`);
  console.log(`1回あたり: 変化技を防いだ ${(c.blocked / Math.max(1, c.set)).toFixed(2)}回`);
}
main();
