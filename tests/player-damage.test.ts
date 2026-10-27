import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { playerDamage } from '../src/ai/player-damage.js';
import { estimateDamage, damageEnvironment } from '../src/ai/damage-estimate.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';

// プレイヤーの視点でのダメージの見積もり: 相手の配分が分からない状態から、当てたときの減り方で補正されることを固定する。

const baseStats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const punch = () => createMove({ name: 'メガトンパンチ', type: 'normal', power: 80, accuracy: 100, pp: 20, category: 'physical' });
const splash = () => createMove({ name: 'はねる', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' });

const attackAgent: BattleAgent = { selectLead: async (team) => team[0]!, selectAction: async () => ({ action: { type: 'move', moveIndex: 0, target: 0 } }) };

async function start() {
  const own = new Pokemon({ name: 'own', types: ['fighting'], ability: 'none', item: null, baseStats, moves: [punch()], statPoints: { ATK: 32, SPEED: 32 } });
  // 相手は実際には HP・防御に振っている。見積もり（base）は無振りなので、そのままでは与ダメージを多く見積もる。
  const opponent = new Pokemon({ name: 'opp', types: ['normal'], ability: 'none', item: null, baseStats, moves: [splash()], statPoints: { HP: 32, DEF: 32 }, nature: 'わんぱく' });
  const session = await BattleSession.start([own], [opponent], { rng: new SeededRandom(5), information: 'partial', opponentStats: 'base' });
  return { session, own, opponent };
}

describe('playerDamage', () => {
  test('最初は相手の見積もりの能力値で計算し、補正なし', async () => {
    const { session, own, opponent } = await start();
    const context = session.getContext(0);
    const view = playerDamage(context, new Map());
    const truth = estimateDamage(own, opponent, own.moves[0]!, damageEnvironment(context, true));
    expect(view.outCalibrated).toBe(false);
    expect(view.out.fraction).toBeGreaterThan(truth.fraction * 1.2);
  });

  test('1回当てると、減り方から相手の耐久を逆算して本当の値に近づく', async () => {
    const { session, own, opponent } = await start();
    await session.playTurn(attackAgent, attackAgent);
    const context = session.getContext(0);
    const view = playerDamage(context, new Map());
    const truth = estimateDamage(own, opponent, own.moves[0]!, damageEnvironment(context, true));
    expect(view.outCalibrated).toBe(true);
    expect(Math.abs(view.out.fraction - truth.fraction)).toBeLessThan(0.03);
  });

  test('相手の技が見えていなければ、仮の技（タイプ一致・威力80）で受けるダメージを見積もる', async () => {
    const { session } = await start();
    const view = playerDamage(session.getContext(0), new Map());
    expect(view.in.fraction).toBeGreaterThan(0);
    expect(view.in.effectiveness).toBe(1);
  });
});

test('変化技しか見せていない相手にも、仮の技で受けるダメージを見積もる', async () => {
  const { session } = await start();
  await session.playTurn(attackAgent, attackAgent);
  expect(session.getContext(0).opponent.moves.map((move) => move.name)).toEqual(['はねる']);
  expect(playerDamage(session.getContext(0), new Map()).in.fraction).toBeGreaterThan(0);
});
