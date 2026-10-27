import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { SeededRandom } from '../src/rng.js';
import { estimateDamage } from '../src/ai/damage-estimate.js';
import type { DamageEnvironment } from '../src/ai/damage-estimate.js';

// 乱数を引かない期待ダメージが、エンジンで実際に撃った平均（命中・急所・乱数込み）と合うことを固定する。

const stats = { HP: 100, ATK: 120, DEF: 80, SPATK: 80, SPDEF: 80, SPEED: 100 };
const environment: DamageEnvironment = { weather: null, terrain: null, reflect: 0, auroraVeil: 0, faintedAllies: 0 };
const mon = (name: string, types: Pokemon['types'], ability: Pokemon['ability'] = 'none', item: Pokemon['item'] = null) =>
  new Pokemon({ name, types, ability, item, baseStats: stats, moves: [] });

function monteCarlo(attacker: () => Pokemon, defender: () => Pokemon, move: () => ReturnType<typeof createMove>, trials = 4000) {
  let lost = 0;
  let kos = 0;
  for (let seed = 1; seed <= trials; seed++) {
    const a = attacker();
    const d = defender();
    const engine = new BattleEngine({ rng: new SeededRandom(seed) });
    engine.setActivePokemon(0, a);
    engine.setActivePokemon(1, d);
    engine.useMove(a, d, move());
    lost += (d.maxHP - d.currentHP) / d.maxHP;
    if (d.isFainted) kos++;
  }
  return { fraction: lost / trials, koChance: kos / trials };
}

const tackle = () => createMove({ name: 'すてみ', type: 'normal', power: 90, accuracy: 85, pp: 10, category: 'physical' });
const multi = () => createMove({ name: 'つららばり', type: 'ice', power: 25, accuracy: 100, pp: 30, category: 'physical', multiHit: true });
const quake = () => createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' });

describe('estimateDamage', () => {
  test('命中85%の技: 期待値が実際の平均に1pt以内で合う', () => {
    const estimate = estimateDamage(mon('a', ['normal']), mon('d', ['water']), tackle(), environment);
    const actual = monteCarlo(() => mon('a', ['normal']), () => mon('d', ['water']), tackle);
    expect(Math.abs(estimate.fraction - actual.fraction)).toBeLessThan(0.01);
    expect(estimate.effectiveness).toBe(1);
  });

  test('連続技: 回数の分布込みで合う', () => {
    const estimate = estimateDamage(mon('a', ['ice']), mon('d', ['dragon', 'flying']), multi(), environment);
    const actual = monteCarlo(() => mon('a', ['ice']), () => mon('d', ['dragon', 'flying']), multi);
    expect(Math.abs(estimate.fraction - actual.fraction)).toBeLessThan(0.015);
    expect(Math.abs(estimate.koChance - actual.koChance)).toBeLessThan(0.03);
    expect(estimate.effectiveness).toBe(4);
  });

  test('ふゆうにじめん技は 0', () => {
    expect(estimateDamage(mon('a', ['ground']), mon('d', ['ghost'], 'levitate'), quake(), environment)).toEqual({ fraction: 0, koChance: 0, effectiveness: 0 });
  });

  test('残り HP が少なければ KO 率が上がり、減る割合は残り HP で頭打ち', () => {
    const low = mon('d', ['water']);
    low.currentHP = 10;
    const estimate = estimateDamage(mon('a', ['normal']), low, tackle(), environment);
    expect(estimate.koChance).toBeCloseTo(0.85, 2);
    expect(estimate.fraction).toBeLessThanOrEqual(10 / low.maxHP + 1e-9);
  });

  test('渡したポケモンは変えない', () => {
    const a = mon('a', ['normal']);
    const d = mon('d', ['water']);
    const move = tackle();
    estimateDamage(a, d, move, environment);
    expect(d.currentHP).toBe(d.maxHP);
    expect(move.pp).toBe(10);
  });
});
