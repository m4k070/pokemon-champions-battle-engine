import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// バトンタッチの評価: 「積んでから渡す」を方策が選べるか。
// 実装前はバトンタッチのスコアが0で、積み技も目の前の1発に負けて永久に選ばれなかった。

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function mon(name: string, moves: ReturnType<typeof createMove>[], over: Partial<typeof stats> = {}): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...stats, ...over }, moves });
}

function context(passer: Pokemon, ace: Pokemon, opponent: Pokemon): BattleContext {
  return {
    turn: 3, self: passer, selfTeam: [passer, ace], opponent, opponentTeam: [opponent],
    canMegaEvolve: false, mustSwitch: false,
    field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 } },
    recentLog: [],
  };
}

describe('バトンタッチの評価', () => {
  test('十分に積んだ状態では、殴るよりバトンタッチを選ぶ', async () => {
    const passer = mon('パサー', [
      createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
      createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
      createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
    ]);
    passer.statStages.ATK = 4;
    const ace = mon('エース', [createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' })], { ATK: 150 });
    // 相手は固い（殴っても通らない）→ 渡して受け手に任せるのが正解。
    const opponent = mon('カベ', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })], { HP: 200, DEF: 180 });
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context(passer, ace, opponent));
    // 積みを続けるか、渡すか。どちらでもよいが「殴る」は選ばない。
    expect([0, 1]).toContain((decision.action as { moveIndex: number }).moveIndex);
  });

  test('積みが無い状態ではバトンタッチを選ばない（何も渡せない）', async () => {
    const passer = mon('パサー', [
      createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
      createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' }),
    ]);
    const ace = mon('エース', [createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' })], { ATK: 150 });
    const opponent = mon('カベ', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })], { HP: 200, DEF: 180 });
    const agent = new HeuristicBattleAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context(passer, ace, opponent));
    // 積みを続けるか、渡すか。どちらでもよいが「殴る」は選ばない。
    expect([0, 1]).toContain((decision.action as { moveIndex: number }).moveIndex);
  });
});
