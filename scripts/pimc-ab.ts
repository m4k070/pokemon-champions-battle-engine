import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { runBattle } from '../src/battle-runner.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import { PimcBattleAgent, type Belief, type SpeciesSet } from '../src/ai/pimc-battle-agent.js';
import { selectTeamWithPlan } from '../src/ai/team-selection.js';
import { SeededRandom } from '../src/rng.js';

// PIMC の効果測定: 同一構築のミラーで「PIMC vs 素のヒューリスティック」を戦わせる。
// 構築差を消すためミラーにし、先攻後攻の偏りは seed ごとに側を入れ替えて相殺する。

function buildBelief(): Belief {
  const belief: Belief = new Map();
  for (const entry of META_TEAMS) {
    for (const pokemon of teamToPokemons(entry)) {
      const sets = belief.get(pokemon.name) ?? [];
      const signature = `${pokemon.moves.map((m) => m.name).sort().join(',')}|${pokemon.item}|${pokemon.ability}`;
      const exists = sets.some((set) => `${set.moves.map((m) => m.name).sort().join(',')}|${set.item}|${set.ability}` === signature);
      if (!exists) {
        sets.push({ moves: pokemon.moves, item: pokemon.item, ability: pokemon.ability });
        belief.set(pokemon.name, sets);
      }
    }
  }
  return belief;
}

async function main(): Promise<void> {
  const seedCount = Number((process.argv.find((a) => a.startsWith('--seeds=')) ?? '--seeds=20').split('=')[1]);
  const samples = Number((process.argv.find((a) => a.startsWith('--samples=')) ?? '--samples=8').split('=')[1]);
  const belief = buildBelief();
  let pimcWins = 0;
  let heuristicWins = 0;
  let draws = 0;
  let games = 0;

  for (const entry of META_TEAMS) {
    if (entry.name === 'メガジュペッタ構築') continue;
    for (let seed = 101; seed < 101 + seedCount; seed++) {
      const teamA = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const teamB = selectTeamWithPlan(entry, teamToPokemons(entry)).members;
      const pimcIsSideA = seed % 2 === 1;
      const pimc = new PimcBattleAgent(belief, samples, seed * 17 + 5);
      const heuristic = new HeuristicBattleAgent(new SeededRandom(seed * 31 + 2));
      const result = await runBattle(
        teamA, teamB,
        pimcIsSideA ? pimc : heuristic,
        pimcIsSideA ? heuristic : pimc,
        { maxTurns: 300, rng: new SeededRandom(seed * 31 + 3), information: 'partial', leadA: teamA[0], leadB: teamB[0] },
      );
      games++;
      const winner = result.winner;
      if (winner === null) { draws++; continue; }
      const pimcSide = pimcIsSideA ? 0 : 1;
      if (winner === pimcSide) pimcWins++;
      else heuristicWins++;
    }
    console.log(`[${entry.name}] 累計 PIMC ${pimcWins} / heuristic ${heuristicWins} / 分 ${draws}`);
  }

  const decided = pimcWins + heuristicWins;
  console.log(`\n合計 ${games}試合（決着 ${decided}, 分 ${draws}）`);
  console.log(`PIMC 勝率 ${(100 * pimcWins / Math.max(1, decided)).toFixed(1)}% (${pimcWins}/${decided})`);
}

main();
