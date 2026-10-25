import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// あくびは「相手がまだねむけでない」ときだけ選ぶ。
// 実装当初は isDrowsy を見ておらず、ねむけ中の相手に撃ち続けて空振りしていた（実測44%）。

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (name: string, moves: ReturnType<typeof createMove>[]) =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves });

function context(self: Pokemon, opponent: Pokemon): BattleContext {
  return {
    turn: 2, self, selfTeam: [self], opponent, opponentTeam: [opponent],
    canMegaEvolve: false, mustSwitch: false,
    field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 } },
    recentLog: [],
  };
}

describe('あくびの判断', () => {
  const moves = () => [
    createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true }),
    createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
  ];

  test('相手がねむけでなければ あくび を選ぶ', async () => {
    const self = mon('カバ', moves());
    const opponent = mon('あいて', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 0 });
  });

  test('相手がすでにねむけなら あくび を選ばない（空振り防止）', async () => {
    const self = mon('カバ', moves());
    const opponent = mon('あいて', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);
    opponent.applyDrowsy(3);
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context(self, opponent));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
  });
});
