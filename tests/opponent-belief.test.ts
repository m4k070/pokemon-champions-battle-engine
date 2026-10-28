import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { statusMoveProbability, compatibleSets, baseStatusRate, buildBelief, type Belief } from '../src/ai/opponent-belief.js';
import { BattleSession } from '../src/battle-runner.js';

// 不完全情報では、まだ見えていない技を「無い」と扱うと判断が歪む。
// 信念（候補セット）から確率で扱うことを固定する。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const attack = (name: string) => createMove({ name, type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' });
const yawn = () => createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });

const belief: Belief = new Map([
  ['mon-a', [
    { moves: [attack('たいあたり'), yawn()] as never, item: 'leftovers', ability: 'none' },
    { moves: [attack('たいあたり'), attack('のしかかり')] as never, item: 'life-orb', ability: 'none' },
  ]],
]);

function redacted(revealed: ReturnType<typeof createMove>[]): Pokemon {
  return new Pokemon({ name: 'mon-a', types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: revealed });
}

describe('相手の型の信念', () => {
  test('見えていない変化技を確率として扱う（0でも1でもない）', () => {
    // 攻撃技しか見えていなくても、候補の半分はあくび持ち
    expect(statusMoveProbability(redacted([attack('たいあたり')]), belief)).toBeCloseTo(0.5, 5);
  });

  test('変化技が開示されたら確率1', () => {
    expect(statusMoveProbability(redacted([attack('たいあたり'), yawn()]), belief)).toBe(1);
  });

  test('開示済みの技と矛盾しない候補だけを使う', () => {
    // のしかかり が見えている → あくび持ちのセットは矛盾するので除外
    const sets = compatibleSets(redacted([attack('たいあたり'), attack('のしかかり')]), belief);
    expect(sets.length).toBe(1);
    expect(statusMoveProbability(redacted([attack('たいあたり'), attack('のしかかり')]), belief)).toBe(0);
  });

  test('未知の種族はメタ全体の base rate で代用する', () => {
    const unknown = new Pokemon({ name: 'unknownmon', types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: [attack('たいあたり')] });
    const rate = statusMoveProbability(unknown, belief);
    expect(rate).toBe(baseStatusRate(belief));
    expect(rate).toBeGreaterThan(0);
  });
});

describe('側ごとの信念', () => {
  const base = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
  const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });
  const make = (name: string) => new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: base, moves: [tackle()] });

  test('見る側の信念で相手の能力値を見積もり、局面と fork に渡す', async () => {
    const fast = make('b');
    fast.statPoints = { SPEED: 32 };
    const beliefA = buildBelief([[fast]]);
    const session = await BattleSession.start([make('a')], [make('b')], {
      information: 'partial', opponentStats: 'belief', beliefs: [beliefA, undefined],
    });
    const context = session.getContext(0);
    expect(context.belief).toBe(beliefA);
    // A から見た b は信念の配分（素早さ全振り）で、実物（無振り）より速い。
    expect(context.opponent.stats.SPEED).toBeGreaterThan(session.activeB.stats.SPEED);
    expect(session.fork().getContext(0).belief).toBe(beliefA);
    // B の側は既定の信念（未登録なら空なので無振り・無補正）。
    expect(session.getContext(1).opponent.stats.SPEED).toBe(session.activeA.stats.SPEED);
  });
});
