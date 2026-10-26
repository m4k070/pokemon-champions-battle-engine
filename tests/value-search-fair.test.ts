import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession, runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { ValueSearchBattleAgent, fairOpponentScenarios } from '../src/ai/value-search-agent.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';
import type { Belief } from '../src/ai/opponent-belief.js';
import type { AgentAction } from '../src/types.js';

// 公平モード（人間との対戦用）: 探索が本番の乱数と相手の伏せ情報を覗かないことを固定する。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const attack = (name: string, power = 40, accuracy = 100) =>
  createMove({ name, type: 'normal', power, accuracy, pp: 20, category: 'physical' });

function makePokemon(name: string, moves: ReturnType<typeof createMove>[], item: Pokemon['item'] = null): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', item, baseStats: stats, moves });
}

class Fixed implements BattleAgent {
  constructor(private readonly action: AgentAction) {}
  async selectLead(team: Pokemon[]) {
    return team[0]!;
  }
  async selectAction(_context: BattleContext) {
    return { action: this.action };
  }
}

const team = () => [makePokemon('mon-a', [attack('はずれやすい技', 90, 50)]), makePokemon('mon-b', [attack('たいあたり')])];

describe('fork の乱数', () => {
  // 命中50%の技を両者が出し、本番と複製の結果（HP）が一致した seed の数。
  async function matches(rngSeed: number | undefined): Promise<number> {
    let same = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const session = await BattleSession.start(team(), team(), { rng: new SeededRandom(seed) });
      const fork = rngSeed === undefined ? session.fork() : session.fork({ rngSeed: rngSeed + seed });
      const act: AgentAction = { type: 'move', moveIndex: 0, target: 0 };
      await fork.playTurn(new Fixed(act), new Fixed(act));
      await session.playTurn(new Fixed(act), new Fixed(act));
      if (fork.activeA.currentHP === session.activeA.currentHP && fork.activeB.currentHP === session.activeB.currentHP) same++;
    }
    return same;
  }

  test('既定の fork は本番と同じ乱数を使う', async () => {
    expect(await matches(undefined)).toBe(40);
  });

  test('rngSeed を渡すと本番の結果を再現しない', async () => {
    expect(await matches(1000)).toBeLessThan(30);
  });
});

describe('fair の相手の手', () => {
  const belief: Belief = new Map([
    ['mon-a', [{ moves: [attack('たいあたり'), attack('のしかかり')] as never, item: 'life-orb', ability: 'none' }]],
  ]);

  function contextOf(opponent: Pokemon): BattleContext {
    const self = makePokemon('mon-self', [attack('たいあたり')]);
    return {
      turn: 1, self, selfTeam: [self], opponent, opponentTeam: [opponent],
      canMegaEvolve: false, mustSwitch: false,
      field: {
        weather: null, weatherTurnsLeft: 0, terrain: null, terrainTurnsLeft: 0, trickRoom: false, trickRoomTurnsLeft: 0,
        stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 },
      },
      recentLog: [],
    };
  }

  test('信念の候補で技と未公開の持ち物を埋める', () => {
    const scenarios = fairOpponentScenarios(contextOf(makePokemon('mon-a', [])), belief);
    expect(scenarios.map((entry) => entry.moves?.[entry.action.type === 'move' ? entry.action.moveIndex : 0]?.name)).toEqual(['たいあたり', 'のしかかり']);
    expect(scenarios.every((entry) => entry.item === 'life-orb')).toBe(true);
  });

  test('公開済みの持ち物は置き換えない', () => {
    const scenarios = fairOpponentScenarios(contextOf(makePokemon('mon-a', [], 'leftovers')), belief);
    expect(scenarios.every((entry) => entry.item === undefined)).toBe(true);
  });

  test('信念に無い種族は公開済みの技を、技が見えていなければ仮の技を使う', () => {
    const revealed = fairOpponentScenarios(contextOf(makePokemon('unknownmon', [attack('かみつく')])), belief);
    expect(revealed.map((entry) => entry.moves?.[0]?.name)).toEqual(['かみつく']);
    const nothing = fairOpponentScenarios(contextOf(makePokemon('unknownmon', [])), belief);
    expect(nothing).toHaveLength(1);
    expect(nothing[0]!.moves?.[0]?.power).toBe(80);
  });
});

describe('fair の ValueSearchBattleAgent', () => {
  test('不完全情報の対戦を最後まで打てる（seed 固定で再現する）', async () => {
    const evaluate = (context: BattleContext) => context.opponent.currentHP / context.opponent.maxHP < 0.5 ? 0.8 : 0.4;
    const play = async () => {
      const a = new ValueSearchBattleAgent(new SeededRandom(1), { evaluate, fairness: 'fair', trustMargin: 0 });
      const b = new ValueSearchBattleAgent(new SeededRandom(2), { evaluate, fairness: 'fair', trustMargin: 0 });
      return runBattle(team(), team(), a, b, { maxTurns: 30, rng: new SeededRandom(5), information: 'partial' });
    };
    const first = await play();
    const second = await play();
    expect(first.winner).toBe(second.winner);
    expect(first.turns).toBe(second.turns);
  });
});
