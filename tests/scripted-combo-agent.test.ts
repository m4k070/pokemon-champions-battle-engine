import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { ScriptedComboAgent } from '../src/ai/scripted-combo-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// 校正用のコンボ方策: 積む → バトンタッチ → 殴る、の手順だけを守る。

const stats = { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function mon(name: string, moves: ReturnType<typeof createMove>[]): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves });
}

function context(boost: number, self?: Pokemon): BattleContext {
  const passer = self ?? mon('パサー', [
    createMove({ name: 'めいそう', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status' }),
    createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }),
  ]);
  passer.statStages.SPATK = boost;
  const ace = mon('エース', [createMove({ name: 'たいあたり', type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical' })]);
  const opponent = mon('相手', [createMove({ name: 'なきごえ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })]);
  return {
    turn: 3, self: passer, selfTeam: [passer, ace], opponent, opponentTeam: [opponent],
    canMegaEvolve: false, mustSwitch: false,
    field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 } },
    recentLog: [],
  };
}

describe('コンボ方策', () => {
  test('積みが足りなければ積み技を選ぶ', async () => {
    const agent = new ScriptedComboAgent(new SeededRandom(1));
    const decision = await agent.selectAction(context(0));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 0 });
    expect(decision.reasoning).toContain('積み');
  });

  test('目標まで積んだらバトンタッチを選ぶ', async () => {
    const agent = new ScriptedComboAgent(new SeededRandom(1), { targetBoost: 2 });
    const decision = await agent.selectAction(context(2));
    expect(decision.action).toMatchObject({ type: 'move', moveIndex: 1 });
    expect(decision.reasoning).toContain('バトン');
  });

  test('積み役を先頭に出す', async () => {
    const agent = new ScriptedComboAgent(new SeededRandom(1));
    const ace = mon('エース', [createMove({ name: 'たいあたり', type: 'normal', power: 60, accuracy: 100, pp: 20, category: 'physical' })]);
    const passer = mon('パサー', [createMove({ name: 'バトンタッチ', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status', pivot: true, passStats: true }), createMove({ name: 'ちょうのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status' })]);
    expect((await agent.selectLead([ace, passer])).name).toBe('パサー');
  });
});
