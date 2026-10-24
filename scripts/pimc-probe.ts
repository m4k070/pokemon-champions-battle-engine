
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { PimcBattleAgent, type Belief } from '../src/ai/pimc-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

const belief: Belief = new Map();
for (const entry of META_TEAMS) for (const p of teamToPokemons(entry)) {
  const sets = belief.get(p.name) ?? [];
  if (!sets.some((s) => s.moves.map((m) => m.name).sort().join() === p.moves.map((m) => m.name).sort().join())) {
    sets.push({ moves: p.moves, item: p.item, ability: p.ability });
    belief.set(p.name, sets);
  }
}
const entry = META_TEAMS.find((t) => t.name === 'メガガブリアスZ構築')!;
for (const seed of [101, 102, 103, 104, 105]) {
  const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
  const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
  const pimcA = seed % 2 === 1;
  const pimc = new PimcBattleAgent(belief, 8, seed * 17 + 5);
  const h = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
  const r = await runBattle(teamA, teamB, pimcA ? pimc : h, pimcA ? h : pimc, {
    maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0],
  });
  console.log(seed, 'winner=', r.winner, 'turns=', r.turns);
  if (r.winner === null) console.log(String(r.log).split('\n').slice(-6).join('\n'));
}
