import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { buildBelief, compatibleSets, estimateStats } from '../src/ai/opponent-belief.js';

// 相手の能力値（配分・性格）は実戦では見えない。opponentStats で見積もりに置き換えることを固定する。

const baseStats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });

function makePokemon(name: string, statPoints: Pokemon['statPoints'] = {}, nature: Pokemon['nature'] = null): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...baseStats }, moves: [tackle()], statPoints, nature });
}

const plain = Pokemon.calculateStats(baseStats, 50);

async function start(opponentStats: 'exact' | 'base' | undefined) {
  const own = makePokemon('own', { ATK: 32 }, 'いじっぱり');
  const opponent = makePokemon('opp', { HP: 32, DEF: 32 }, 'わんぱく');
  opponent.currentHP = Math.floor(opponent.maxHP / 2);
  const session = await BattleSession.start([own], [opponent], {
    rng: new SeededRandom(1), information: 'partial', ...(opponentStats ? { opponentStats } : {}),
  });
  return { session, own, opponent };
}

describe('相手の能力値の見積もり', () => {
  test('既定（exact）は実際の能力値をそのまま見せる', async () => {
    const { session, opponent } = await start(undefined);
    expect(session.getContext(0).opponent.stats).toEqual(opponent.stats);
  });

  test("'base' は無振り・無補正の値に置き換え、HP は割合を保つ。実物と自分側は変えない", async () => {
    const { session, own, opponent } = await start('base');
    const context = session.getContext(0);
    expect(context.opponent.stats).toEqual(plain);
    expect(context.opponent.maxHP).toBe(plain.HP);
    expect(context.opponent.currentHP / context.opponent.maxHP).toBeCloseTo(opponent.currentHP / opponent.maxHP, 2);
    expect(context.self.stats).toEqual(own.stats);
    expect(opponent.stats.DEF).toBeGreaterThan(plain.DEF);
  });

  test('fork も見積もりの設定を引き継ぐ', async () => {
    const { session } = await start('base');
    expect(session.fork().getContext(0).opponent.stats).toEqual(plain);
  });

  test("'belief' は候補セットごとに計算した能力値の平均", () => {
    const bulky = makePokemon('opp', { DEF: 32 }, 'わんぱく');
    // 同じ技・持ち物・特性のセットは1つにまとめられるので、もう1つの候補は持ち物を変える。
    const frail = makePokemon('opp');
    frail.item = 'leftovers';
    const belief = buildBelief([[bulky], [frail]]);
    expect(estimateStats(makePokemon('opp'), 'belief', buildBelief([[bulky]])).DEF).toBe(bulky.stats.DEF);
    expect(estimateStats(makePokemon('opp'), 'belief', belief).DEF).toBe(Math.round((bulky.stats.DEF + frail.stats.DEF) / 2));
    // 候補が無い種族は無振り・無補正。
    expect(estimateStats(makePokemon('unknown'), 'belief', belief)).toEqual(plain);
  });

  test('メガシンカで名前が変わっても、元の名前で信念を引く', () => {
    const belief = buildBelief([[makePokemon('opp')]]);
    const mega = makePokemon('opp');
    mega.baseName = 'opp';
    mega.name = 'opp-mega';
    expect(compatibleSets(mega, belief)).toHaveLength(1);
  });
});
