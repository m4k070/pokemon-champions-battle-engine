import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { SeededRandom } from '../src/rng.js';

// おはかまいり: 倒れている味方1体につき威力+50（本編仕様）。イダイトウの主砲。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const mon = (name: string): Pokemon =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: [] });

const lastRespects = () =>
  createMove({ name: 'おはかまいり', type: 'ghost', power: 50, accuracy: 100, pp: 10, category: 'physical', powerPerFaintedAlly: true });

function run(faintedAllies: number): { damage: number; log: string[] } {
  const attacker = mon('イダイトウ');
  const allies = [mon('味方1'), mon('味方2')];
  allies.slice(0, faintedAllies).forEach((ally) => ally.takeDamage(ally.maxHP));
  // ゴーストはノーマルに効かないので、相手はエスパーにする。
  const defender = new Pokemon({ name: '相手', types: ['psychic'], ability: 'none', item: null, baseStats: stats, moves: [] });
  const engine = new BattleEngine({ rng: new SeededRandom(7) });
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);
  engine.registerTeams([attacker, ...allies], [defender]);
  engine.useMove(attacker, defender, lastRespects());
  return { damage: defender.maxHP - defender.currentHP, log: engine.log.map(String) };
}

describe('おはかまいり', () => {
  test('倒れた味方がいなければ威力50のまま', () => {
    const { damage, log } = run(0);
    expect(damage).toBeGreaterThan(0);
    expect(log.some((line) => line.includes('おはかまいりの威力'))).toBe(false);
  });

  test('倒れた味方1体につき威力が50上がる', () => {
    const none = run(0).damage;
    const one = run(1);
    const two = run(2);
    expect(one.log).toContain('おはかまいりの威力が100になった');
    expect(two.log).toContain('おはかまいりの威力が150になった');
    // 同じ乱数なので、威力の比（2倍・3倍）に近いダメージになる。
    expect(one.damage / none).toBeGreaterThan(1.8);
    expect(two.damage / none).toBeGreaterThan(2.7);
  });
});
