import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { opponentScenarios } from '../src/ai/value-search-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import type { Belief } from '../src/ai/opponent-belief.js';

// 1手先読みの相手モデルが、伏せ情報を見ていないことを固定する。
// ここが崩れると「情報が漏れた状態で測った勝率」を実力と誤認する。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const attack = (name: string) => createMove({ name, type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical' });
const yawn = () => createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });

const belief: Belief = new Map([
  ['mon-a', [
    { moves: [attack('たいあたり'), yawn()] as never, item: 'leftovers', ability: 'none' },
    { moves: [attack('たいあたり'), attack('のしかかり')] as never, item: 'life-orb', ability: 'none' },
  ]],
]);

function makePokemon(name: string, moves: ReturnType<typeof createMove>[]): Pokemon {
  return new Pokemon({ name, types: ['normal'], ability: 'none', baseStats: stats, moves });
}

function makeContext(opponent: Pokemon, bench: Pokemon[] = []): BattleContext {
  const self = makePokemon('mon-self', [attack('たいあたり')]);
  return {
    turn: 1,
    self,
    selfTeam: [self],
    opponent,
    opponentTeam: [opponent, ...bench],
    canMegaEvolve: false,
    mustSwitch: false,
    field: {
      weather: null,
      weatherTurnsLeft: 0,
      terrain: null,
      terrainTurnsLeft: 0,
      trickRoom: false,
      trickRoomTurnsLeft: 0,
      stealthRock: { self: false, opponent: false },
    },
    recentLog: [],
  };
}

describe('1手先読みの相手モデル（信念）', () => {
  test('相手の伏せ技が違っても、想定する手は変わらない', () => {
    // 見えているのは たいあたり だけ。伏せている技が違う2体を比べる。
    const hiddenA = makePokemon('mon-a', [attack('たいあたり'), yawn()]);
    const hiddenB = makePokemon('mon-a', [attack('たいあたり'), attack('のしかかり')]);
    const a = opponentScenarios(makeContext(hiddenA), belief);
    const b = opponentScenarios(makeContext(hiddenB), belief);
    expect(a.length).toBe(b.length);
    expect(a.map((entry) => entry.action)).toEqual(b.map((entry) => entry.action));
  });

  test('見えていない技も候補に入る（開示済みだけにしない）', () => {
    const opponent = makePokemon('mon-a', [attack('たいあたり')]);
    const scenarios = opponentScenarios(makeContext(opponent), belief);
    // 2セット × 各2技 = 4手
    expect(scenarios.length).toBe(4);
    expect(scenarios.every((entry) => entry.moves !== null)).toBe(true);
  });

  test('ベンチに残っている相手は交代の手として数える', () => {
    const opponent = makePokemon('mon-a', [attack('たいあたり')]);
    const bench = makePokemon('mon-b', [attack('たいあたり')]);
    const scenarios = opponentScenarios(makeContext(opponent, [bench]), belief);
    const switches = scenarios.filter((entry) => entry.action.type === 'switch');
    expect(switches.length).toBe(1);
    expect(switches[0]!.action).toEqual({ type: 'switch', pokemonIndex: 1 });
  });

  test('信念に無い種族は開示済みの技だけを使う', () => {
    const unknown = makePokemon('unknownmon', [attack('たいあたり')]);
    const scenarios = opponentScenarios(makeContext(unknown), belief);
    expect(scenarios.length).toBe(1);
    expect(scenarios[0]!.moves).toBeNull();
  });
});
