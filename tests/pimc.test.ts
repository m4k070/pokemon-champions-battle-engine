import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { PimcBattleAgent, type Belief } from '../src/ai/pimc-battle-agent.js';

// PIMC は相手の未公開の技・持ち物・特性を、種族ごとの候補セットから埋める。
// 埋めた結果は「4技・持ち物・特性が揃った世界」になる（完全情報化）。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const move = (name: string, extra: Record<string, unknown> = {}) =>
  createMove({ name, type: 'normal', power: 40, accuracy: 100, pp: 20, category: 'physical', ...extra } as never);

describe('PIMC の決定化', () => {
  test('伏せられた技・持ち物・特性を候補セットから埋める', () => {
    const belief: Belief = new Map([
      ['garchomp', [
        { moves: [move('じしん'), move('げきりん'), move('つるぎのまい', { power: 0, category: 'status' }), move('ストーンエッジ')], item: 'life-orb', ability: 'rough-skin' },
      ]],
    ]);
    const redacted = new Pokemon({
      name: 'garchomp', types: ['dragon', 'ground'], ability: 'none',
      baseStats: stats, moves: [move('じしん')], item: null,
    });

    const agent = new PimcBattleAgent(belief, 4, 1);
    const world = agent.determinize(redacted);
    expect(world.moves.length).toBe(4);
    expect(world.item).toBe('life-orb');
    expect(world.ability).toBe('rough-skin');
    // 元の個体は書き換えない（参照を共有しない）
    expect(redacted.moves.length).toBe(1);
    expect(redacted.item).toBeNull();
  });

  test('候補が無い種族はそのまま返す', () => {
    const belief: Belief = new Map();
    const unknown = new Pokemon({ name: 'unknownmon', types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: [move('たいあたり')] });
    const agent = new PimcBattleAgent(belief, 2, 1);
    expect(agent.determinize(unknown).moves.length).toBe(1);
  });
});
