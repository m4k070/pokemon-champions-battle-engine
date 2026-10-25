import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HeuristicBattleAgent } from '../src/ai/heuristic-battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// みがわりの評価は「HPが高い」だけでは決めない。
// 1発で壊れないか、相手が変化技を持つか、こちらに積み技があるかで変える。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const mon = (name: string, moves: ReturnType<typeof createMove>[], over: Partial<typeof stats> = {}) =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...stats, ...over }, moves });

const subMove = () => createMove({ name: 'みがわり', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', createsSubstitute: true });
const weakAttack = () => createMove({ name: 'でんこうせっか', type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' });
const strongAttack = () => createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' });
const setupMove = () => createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });
const yawnMove = () => createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });

function context(self: Pokemon, opponent: Pokemon): BattleContext {
  return {
    turn: 2, self, selfTeam: [self], opponent, opponentTeam: [opponent],
    canMegaEvolve: false, mustSwitch: false,
    field: { weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0, stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 } },
    recentLog: [],
  };
}

async function scoreOfSubstitute(self: Pokemon, opponent: Pokemon): Promise<number> {
  const agent = new HeuristicBattleAgent(new SeededRandom(1));
  await agent.selectAction(context(self, opponent));
  return agent.lastEvaluation.find((entry) => entry.label === 'みがわり')?.score ?? -1;
}

describe('みがわりの評価', () => {
  test('相手が変化技を持ち、1発で壊れず、こちらに積み技があると高くなる', async () => {
    const self = mon('自分', [subMove(), weakAttack(), setupMove()]);
    // 変化技＋弱い攻撃（打点0だと「1発で壊れない」判定にならず、条件の差が消える）
    const softOpponent = mon('変化技持ち', [yawnMove(), weakAttack()], { ATK: 60 });
    const attacker = mon('物理一本', [strongAttack()], { ATK: 180 });

    const withStatus = await scoreOfSubstitute(self, softOpponent);
    const withAttacker = await scoreOfSubstitute(self, attacker);
    expect(withStatus).toBeGreaterThan(withAttacker);
  });

  test('HPが低いときは0', async () => {
    const self = mon('自分', [subMove(), weakAttack()]);
    self.currentHP = Math.floor(self.maxHP * 0.3);
    const opponent = mon('相手', [yawnMove()], { ATK: 60 });
    expect(await scoreOfSubstitute(self, opponent)).toBe(0);
  });
});
