import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HybridBattleAgent } from '../src/ai/hybrid-battle-agent.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

const apiKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY;
if (!apiKey) throw new Error('OPENCODE_GO_API_KEY がありません');

async function main() {
  const nameA = process.argv[2] ?? 'カバルカ構築';
  const nameB = process.argv[3] ?? 'メガグソクムシャ構築';
  const maxTurns = Number(process.argv[4] ?? '20');
  const entryA = META_TEAMS.find((t) => t.name === nameA)!;
  const entryB = META_TEAMS.find((t) => t.name === nameB)!;
  const teamA = selectTeamWithPlan(entryA, teamToPokemons(entryA)).members;
  const teamB = selectTeamWithPlan(entryB, teamToPokemons(entryB)).members;
  console.log(`A(hybrid)=${teamA.map((p) => p.name).join('/')} B(heuristic)=${teamB.map((p) => p.name).join('/')}`);

  const mode = process.argv[5] ?? 'all';
  const options = mode === 'always'
    ? { apiKey, maxConsultations: 999, cooldownTurns: 0, alwaysConsult: true }
    : mode === 'hesitation'
      ? { apiKey, maxConsultations: 999, cooldownTurns: 0, triggers: ['判断が拮抗' as const] }
      : { apiKey, maxConsultations: 8, cooldownTurns: 2 };
  const hybrid = new HybridBattleAgent(new SeededRandom(101), options);
  const heuristic = new HeuristicBattleAgent(new SeededRandom(202));
  const started = Date.now();
  const result = await runBattle(teamA, teamB, hybrid, heuristic, {
    maxTurns, rng: new SeededRandom(11), information: 'partial', leadA: teamA[0], leadB: teamB[0],
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const decided = result.winner === 0 ? nameA : result.winner === 1 ? nameB : '引き分け';

  console.log(`\n結果: 勝者=${decided} ターン=${result.turns} 所要=${seconds}s`);
  console.log(`相談回数=${hybrid.consultations.length} 上書き=${hybrid.consultations.filter((c) => !c.agreed).length} 失敗=${hybrid.consultations.filter((c) => c.error).length}`);
  console.log(`平均応答=${(hybrid.consultations.reduce((s, c) => s + c.ms, 0) / Math.max(1, hybrid.consultations.length) / 1000).toFixed(1)}s`);
  const overrides = hybrid.consultations.filter((c) => !c.agreed).length;
  console.log(`SUMMARY mode=${mode} winner=${decided} turns=${result.turns} consults=${hybrid.consultations.length} overrides=${overrides} failures=${hybrid.consultations.filter((c) => c.error).length} avg=${(hybrid.consultations.reduce((s2, c) => s2 + c.ms, 0) / Math.max(1, hybrid.consultations.length) / 1000).toFixed(1)}s`);
  console.log('--- 生応答 ---');
  for (const raw of hybrid.rawResponses.slice(0, 4)) console.log(`  ${JSON.stringify(raw).slice(0, 160)}`);
  for (const c of hybrid.consultations) {
    const margin = c.margin === undefined ? '-' : c.margin.toFixed(2);
    const confidence = c.confidence === undefined ? '-' : c.confidence.toFixed(2);
    console.log(`  turn${c.turn} ${c.reason} ${c.agreed ? '同意' : '上書き'} ${(c.ms / 1000).toFixed(1)}s 迷い=${margin} 確信=${confidence} ${c.error ?? ''}`);
  }
}
main();
