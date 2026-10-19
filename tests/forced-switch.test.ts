import { BattleSession } from '../src/battle-runner.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import type { AbilityName } from '../src/ability-names.js';
import type { TypeName } from '../src/types.js';
import type { MoveData } from '../src/types.js';

// ほえる・ドラゴンテールによる強制交代。
// 実際の交代はチームを持つ BattleRunner が行う（エンジンは印を立てるだけ）。
function makePokemon(params: {
  name: string;
  moves: MoveData[];
  speed?: number;
  baseHP?: number;
  types?: TypeName[];
  ability?: AbilityName;
}): Pokemon {
  return new Pokemon({
    name: params.name,
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: null,
    baseStats: {
      HP: params.baseHP ?? 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: params.speed ?? 50,
    },
    moves: params.moves,
  });
}

const roar = () => createMove({
  name: 'ほえる', type: 'normal', category: 'status', forcesSwitch: true,
});
const dragonTail = () => createMove({
  // 命中率は乱数（SYSTEM_RANDOM）に依存するため、テストでは必中にする
  name: 'ドラゴンテール', type: 'dragon', power: 60, accuracy: 100, category: 'physical', forcesSwitch: true,
});
const tackle = () => createMove({
  name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical',
});

describe('強制交代', () => {
  test('ほえるで相手が控えと交代させられる', async () => {
    // Arrange
    const roarer = makePokemon({ name: 'Roarer', speed: 200, moves: [roar()] });
    const lead = makePokemon({ name: 'Lead', speed: 1, moves: [tackle()] });
    const bench1 = makePokemon({ name: 'Bench1', speed: 1, moves: [tackle()] });
    const bench2 = makePokemon({ name: 'Bench2', speed: 1, moves: [tackle()] });
    const session = await BattleSession.start([roarer], [lead, bench1, bench2]);

    // Act
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0 } },
      { action: { type: 'move', moveIndex: 0 } },
    );

    // Assert
    expect([bench1, bench2]).toContain(session.activeB);
    expect(session.activeB).not.toBe(lead);
    expect(session.engine.getLog()).toContain('場を追い出された');
  });

  test('控えが全員瀕死なら交代しない', async () => {
    // Arrange
    const roarer = makePokemon({ name: 'Roarer', speed: 200, moves: [roar()] });
    const lead = makePokemon({ name: 'Lead', speed: 1, moves: [tackle()] });
    const fainted = makePokemon({ name: 'Fainted', speed: 1, moves: [tackle()] });
    fainted.currentHP = 0;
    const session = await BattleSession.start([roarer], [lead, fainted]);

    // Act
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0 } },
      { action: { type: 'move', moveIndex: 0 } },
    );

    // Assert
    expect(session.activeB).toBe(lead);
  });

  test('ドラゴンテールはダメージを与えてから交代させる', async () => {
    // Arrange
    const attacker = makePokemon({ name: 'Attacker', speed: 200, moves: [dragonTail()] });
    const lead = makePokemon({ name: 'Lead', speed: 1, types: ['dragon'], moves: [tackle()] });
    const bench = makePokemon({ name: 'Bench', speed: 1, types: ['dragon'], moves: [tackle()] });
    const session = await BattleSession.start([attacker], [lead, bench]);
    const hpBefore = lead.currentHP;

    // Act
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0 } },
      { action: { type: 'move', moveIndex: 0 } },
    );

    // Assert
    expect(lead.currentHP).toBeLessThan(hpBefore); // ダメージは入る
    expect(session.activeB).toBe(bench);           // そのうえで交代する
  });
});
