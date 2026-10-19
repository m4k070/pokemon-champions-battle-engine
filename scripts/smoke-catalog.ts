// カタログ全構築でミラー1試合を走らせ、ターン数と勝敗を確認する（テスト前の下見）。
// 使い方: npx tsx scripts/smoke-catalog.ts
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { BattleSession } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import { fixedRandom } from '../tests/helpers/scripted-random.js';

const CAP = 500;
for (const [i, entry] of META_TEAMS.entries()) {
  const teamA = teamToPokemons(entry);
  const teamB = teamToPokemons(entry);
  const session = await BattleSession.start(teamA, teamB, { rng: new SeededRandom(2026 + i) });
  const agent = new RandomBattleAgent(fixedRandom(0.5));
  let turns = 0;
  while (!session.isFinished() && turns < CAP) {
    await session.playTurn(agent, agent);
    turns++;
  }
  console.log(
    `${i} ${entry.name}: turns=${turns} finished=${session.isFinished()} winner=${session.winner()} log=${session.engine.getLog().length}`,
  );
}
