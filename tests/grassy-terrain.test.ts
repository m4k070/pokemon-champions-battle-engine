import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { runBattle } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';

// グラスフィールド（本編仕様）: グラスメイカーで展開し、接地している側のくさ技1.3倍、
// 接地している相手へのじしん・じならし半減、ターン終了時に1/16回復、グラススライダーの優先度+1。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  types?: Pokemon['types'];
  ability?: Pokemon['ability'];
  speed?: number;
  moves?: ReturnType<typeof createMove>[];
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: null,
    baseStats: options.speed === undefined ? stats : { ...stats, SPEED: options.speed },
    moves: options.moves ?? [],
  });

const energyBall = () => createMove({ name: 'エナジーボール', type: 'grass', power: 90, accuracy: 100, pp: 10, category: 'special' });
const earthquake = () => createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' });
const grassyGlide = () =>
  createMove({ name: 'グラススライダー', type: 'grass', power: 55, accuracy: 100, pp: 20, category: 'physical', priorityInGrassyTerrain: true });
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical' });

function damageWith(move: ReturnType<typeof createMove>, terrain: boolean, attackerTypes: Pokemon['types'] = ['normal']): number {
  const attacker = mon('攻撃側', { types: attackerTypes });
  const defender = mon('相手');
  const engine = new BattleEngine({ rng: new SeededRandom(5) });
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);
  if (terrain) engine.setTerrainFromAbility('grassy-terrain', 5);
  engine.useMove(attacker, defender, move);
  return defender.maxHP - defender.currentHP;
}

class Fixed implements BattleAgent {
  async selectLead(team: Pokemon[]): Promise<Pokemon> { return team[0]!; }
  async selectAction(_context: BattleContext) {
    return { action: { type: 'move' as const, moveIndex: 0, target: 0 } };
  }
}

describe('グラスフィールド', () => {
  test('接地している側のくさ技は1.3倍', () => {
    const plain = damageWith(energyBall(), false);
    const boosted = damageWith(energyBall(), true);
    expect(boosted / plain).toBeGreaterThan(1.2);
    expect(boosted / plain).toBeLessThan(1.4);
  });

  test('ひこうタイプのくさ技は強化されない', () => {
    expect(damageWith(energyBall(), true, ['flying'])).toBe(damageWith(energyBall(), false, ['flying']));
  });

  test('接地している相手へのじしんは半減', () => {
    const plain = damageWith(earthquake(), false);
    const halved = damageWith(earthquake(), true);
    expect(halved / plain).toBeGreaterThan(0.4);
    expect(halved / plain).toBeLessThan(0.6);
  });

  test('ターン終了時に接地しているポケモンを1/16回復する', () => {
    const grounded = mon('接地');
    const flying = mon('ひこう', { types: ['flying'] });
    grounded.takeDamage(100);
    flying.takeDamage(100);
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    engine.setActivePokemon(0, grounded);
    engine.setActivePokemon(1, flying);
    engine.setTerrainFromAbility('grassy-terrain', 5);
    engine.endTurn([grounded], [flying]);
    expect(grounded.currentHP).toBe(grounded.maxHP - 100 + Math.floor(grounded.maxHP / 16));
    expect(flying.currentHP).toBe(flying.maxHP - 100);
  });

  test('グラスメイカーは場に出たときにグラスフィールドを展開する', async () => {
    const rillaboom = mon('ゴリランダー', { ability: 'grassy-surge', moves: [tackle()] });
    const opponent = mon('相手', { moves: [tackle()] });
    const result = await runBattle([rillaboom], [opponent], new Fixed(), new Fixed(), { maxTurns: 1, rng: new SeededRandom(3) });
    expect(String(result.log)).toContain('グラスメイカーでグラスフィールドが発動した');
  });

  test('グラススライダーはグラスフィールドで先制する', async () => {
    // 遅い側がグラススライダー。フィールドがあれば先に動く。
    const slow = mon('遅いゴリランダー', { ability: 'grassy-surge', speed: 10, moves: [grassyGlide()] });
    const fast = mon('速い相手', { speed: 200, moves: [tackle()] });
    const result = await runBattle([slow], [fast], new Fixed(), new Fixed(), { maxTurns: 1, rng: new SeededRandom(4) });
    const log = String(result.log).split("\n");
    const glide = log.findIndex((line) => line.includes('グラススライダー'));
    const tackleLine = log.findIndex((line) => line.includes('たいあたり'));
    expect(glide).toBeGreaterThanOrEqual(0);
    expect(tackleLine).toBeGreaterThan(glide);
  });

  test('フィールドが無ければグラススライダーは先制しない', async () => {
    const slow = mon('遅いゴリランダー', { speed: 10, moves: [grassyGlide()] });
    const fast = mon('速い相手', { speed: 200, moves: [tackle()] });
    const result = await runBattle([slow], [fast], new Fixed(), new Fixed(), { maxTurns: 1, rng: new SeededRandom(4) });
    const log = String(result.log).split("\n");
    expect(log.findIndex((line) => line.includes('たいあたり'))).toBeLessThan(log.findIndex((line) => line.includes('グラススライダー')));
  });
});
