import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { SeededRandom } from '../src/rng.js';

// ふうせん（本編仕様）: 割れるまでじめん技が当たらず、接地していない扱いになる。
// ダメージ技を受けると割れる。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const mon = (name: string, item: Pokemon['item'] = null): Pokemon =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item, baseStats: stats, moves: [] });

const earthquake = () => createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' });
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });

function setup(defender: Pokemon): { engine: BattleEngine; attacker: Pokemon } {
  const attacker = mon('攻撃側');
  const engine = new BattleEngine({ rng: new SeededRandom(9) });
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);
  return { engine, attacker };
}

describe('ふうせん', () => {
  test('割れるまでじめん技が当たらない', () => {
    const holder = mon('ふうせん持ち', 'air-balloon');
    const { engine, attacker } = setup(holder);
    const result = engine.useMove(attacker, holder, earthquake());
    expect(result).toEqual({ outcome: 'failed', reason: 'blocked-by-item' });
    expect(holder.currentHP).toBe(holder.maxHP);
    expect(engine.isGrounded(holder)).toBe(false);
  });

  test('ダメージ技を受けると割れ、その後はじめん技が当たる', () => {
    const holder = mon('ふうせん持ち', 'air-balloon');
    const { engine, attacker } = setup(holder);
    engine.useMove(attacker, holder, tackle());
    expect(holder.itemUsed).toBe(true);
    expect(engine.log.map(String)).toContain('ふうせん持ちのふうせんが割れた');
    expect(engine.isGrounded(holder)).toBe(true);
    const hpBefore = holder.currentHP;
    engine.useMove(attacker, holder, earthquake());
    expect(holder.currentHP).toBeLessThan(hpBefore);
  });

  test('まきびしを踏まない', () => {
    const holder = mon('ふうせん持ち', 'air-balloon');
    const { engine } = setup(holder);
    engine.field.spikes.playerB = 1;
    engine.switchIn(holder, [holder], 1);
    expect(holder.currentHP).toBe(holder.maxHP);
  });
});
