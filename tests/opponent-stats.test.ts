import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { buildBelief, compatibleSets, estimateStats } from '../src/ai/opponent-belief.js';
import { fairOpponentScenarios } from '../src/ai/value-search-agent.js';

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

describe('相手の選出の控えと、観察したダメージ', () => {
  const strong = () => createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 15, category: 'physical' });
  async function session() {
    const mine = [makePokemon('own')];
    mine[0]!.moves = [strong()];
    const theirs = [makePokemon('lead'), makePokemon('bench')];
    const s = await BattleSession.start(mine, theirs, { rng: new SeededRandom(3), information: 'partial' });
    return s;
  }

  test('場に出た控えだけを交代先の候補にする（不完全情報）', async () => {
    const s = await session();
    const context = s.getContext(0);
    expect(context.opponentTeam.map((pokemon) => pokemon.hasAppeared)).toEqual([true, false]);
    const switches = fairOpponentScenarios(context, new Map()).filter((scenario) => scenario.action.type === 'switch');
    expect(switches).toHaveLength(0);
  });

  test('与えたダメージを HP の割合で記録し、fork に引き継ぐ', async () => {
    const s = await session();
    const act = { type: 'move' as const, moveIndex: 0, target: 0 };
    await s.playTurn({ selectLead: async (team) => team[0]!, selectAction: async () => ({ action: act }) },
      { selectLead: async (team) => team[0]!, selectAction: async () => ({ action: act }) });
    const mine = s.observedDamage.find((entry) => entry.attackerSide === 0)!;
    expect(mine.move).toBe('すてみタックル');
    expect(mine.defenderIndex).toBe(0);
    expect(mine.fraction).toBeCloseTo(1 - s.teamB[0]!.currentHP / s.teamB[0]!.maxHP, 6);
    expect(s.fork().observedDamage).toEqual(s.observedDamage);
  });
});
