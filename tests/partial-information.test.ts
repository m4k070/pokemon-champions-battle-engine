import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';

// 不完全情報モードの検証。
//   相手の技・持ち物・特性は使われるまで見えない
//   技が使われると、その技だけが見えるようになる

function makePokemon(name: string, moveNames: string[], item: string | null = null): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item: item as never,
    baseStats: { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    moves: moveNames.map((moveName) => createMove({
      name: moveName, type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical',
    })),
  });
}

describe('不完全情報モード', () => {
  test('初期状態では相手の技と持ち物が見えない', async () => {
    const a = makePokemon('A', ['たいあたり', 'ずつき']);
    const b = makePokemon('B', ['たいあたり', 'ずつき'], 'leftovers');
    const session = await BattleSession.start([a], [b], { information: 'partial' });

    const context = session.getContext(0);
    expect(context.opponent.moves).toHaveLength(0);
    expect(context.opponent.item).toBeNull();
    expect(context.opponent.ability).toBe('none');
    // 自分の情報は伏せられない
    expect(context.self.moves).toHaveLength(2);
  });

  test('相手が使った技だけが見えるようになる', async () => {
    const a = makePokemon('A', ['たいあたり', 'ずつき']);
    const b = makePokemon('B', ['たいあたり', 'ずつき']);
    const session = await BattleSession.start([a], [b], { information: 'partial', rng: new SeededRandom(5) });

    await session.playTurn(new RandomBattleAgent(new SeededRandom(1)), new RandomBattleAgent(new SeededRandom(2)));
    const context = session.getContext(0);
    expect(context.opponent.moves.length).toBe(1);
  });

  test('完全情報モードでは従来どおり全部見える', async () => {
    const a = makePokemon('A', ['たいあたり']);
    const b = makePokemon('B', ['たいあたり', 'ずつき'], 'leftovers');
    const session = await BattleSession.start([a], [b]);
    const context = session.getContext(0);
    expect(context.opponent.moves).toHaveLength(2);
    expect(context.opponent.item).toBe('leftovers');
  });
});
