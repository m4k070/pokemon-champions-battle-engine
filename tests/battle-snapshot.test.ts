import { createMove } from "../src/move.js";
import { snapshotBattle, restoreBattle, snapshotPokemon, restorePokemon } from '../src/battle-snapshot.js';
import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';

function makeGarchomp(): Pokemon {
  return new Pokemon({
    name: 'Garchomp',
    types: ['dragon', 'ground'],
    ability: 'rough-skin',
    item: 'choice-scarf',
    baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    moves: [createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 })],
  });
}

describe('Pokemon isFainted derivation', () => {
  test('constructing with currentHP 0 marks the Pokemon as fainted', () => {
    const pokemon = new Pokemon({
      name: 'Garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      currentHP: 0,
    });

    expect(pokemon.isFainted).toBe(true);
  });
});

describe('snapshotPokemon / restorePokemon', () => {
  test('round-trips HP, status, and move PP exactly', () => {
    const original = makeGarchomp();
    original.currentHP = 40;
    original.applyStatus('burn');
    original.moves[0].pp = 3;
    original.lockMove(0);

    const restored = restorePokemon(snapshotPokemon(original));

    expect(restored.currentHP).toBe(40);
    expect(restored.maxHP).toBe(original.maxHP);
    expect(restored.status).toBe('burn');
    expect(restored.moves[0].pp).toBe(3);
    expect(restored.lockedMove).toBe(0);
    expect(restored.isFainted).toBe(false);
  });

  test('mutating the restored Pokemon does not affect the original', () => {
    const original = makeGarchomp();
    const restored = restorePokemon(snapshotPokemon(original));

    restored.moves[0].pp = 0;
    restored.currentHP = 0;

    expect(original.moves[0].pp).toBe(10);
    expect(original.currentHP).toBe(original.maxHP);
  });
});

describe('snapshotBattle / restoreBattle', () => {
  test('round-trips turn/weather/hazards and which Pokemon is active', () => {
    const engine = new BattleEngine();
    const teamA = [makeGarchomp(), makeGarchomp()];
    const teamB = [makeGarchomp()];

    engine.setActivePokemon(0, teamA[1]);
    engine.setActivePokemon(1, teamB[0]);
    engine.turn = 4;
    engine.weather = 'sand';
    engine.weatherTurnsLeft = 2;
    engine.setStealthRock(1);
    teamA[1].currentHP = 10;

    const snapshot = snapshotBattle(engine, teamA, teamB, teamA[1], teamB[0]);
    const restored = restoreBattle(snapshot);

    expect(restored.engine.turn).toBe(4);
    expect(restored.engine.weather).toBe('sand');
    expect(restored.engine.weatherTurnsLeft).toBe(2);
    expect(restored.engine.field.stealthRock.playerB).toBe(true);
    expect(restored.activeA.currentHP).toBe(10);
    expect(restored.activeA).toBe(restored.teamA[1]); // 参照がteamA配列内の同じ個体を指している
    expect(restored.activeB).toBe(restored.teamB[0]);
  });

  test('restored battle is fully independent from the original (no shared references)', () => {
    const engine = new BattleEngine();
    const teamA = [makeGarchomp()];
    const teamB = [makeGarchomp()];
    engine.setActivePokemon(0, teamA[0]);
    engine.setActivePokemon(1, teamB[0]);

    const snapshot = structuredClone(snapshotBattle(engine, teamA, teamB, teamA[0], teamB[0]));
    const restored = restoreBattle(snapshot);

    restored.teamA[0].currentHP = 1;
    restored.engine.weather = 'rain';

    expect(teamA[0].currentHP).toBe(teamA[0].maxHP);
    expect(engine.weather).toBeNull();
  });
});

describe('snapshotPokemon / restorePokemon: 揮発状態とフォルム', () => {
  function makeSwitchable(): Pokemon {
    return new Pokemon({
      name: 'ギルガルド',
      types: ['steel', 'ghost'],
      ability: 'battle-switch',
      item: 'leftovers',
      baseStats: { HP: 60, ATK: 50, DEF: 150, SPATK: 50, SPDEF: 150, SPEED: 60 },
      moves: [createMove({ name: 'shadow-ball', type: 'ghost', power: 80, accuracy: 100, pp: 15 })],
      formStats: {
        normal: { baseStats: { HP: 60, ATK: 50, DEF: 150, SPATK: 50, SPDEF: 150, SPEED: 60 } },
        blade: { baseStats: { HP: 60, ATK: 150, DEF: 50, SPATK: 150, SPDEF: 50, SPEED: 60 } },
      },
    });
  }

  test('ちょうはつ・フォルム・レベルを保持する', () => {
    const original = makeSwitchable();
    original.setForm('blade');
    original.applyTaunt(3);
    original.level = 50;

    const restored = restorePokemon(snapshotPokemon(original));

    expect(restored.form).toBe('blade');
    expect(restored.formStats).not.toBeNull();
    expect(restored.tauntTurnsLeft).toBe(3);
    expect(restored.isTaunted).toBe(true);
    expect(restored.level).toBe(50);
    expect(restored.stats).toEqual(original.stats);
    expect(restored.item).toBe('leftovers');
  });

  test('formStats は参照を共有しない', () => {
    const original = makeSwitchable();

    const restored = restorePokemon(snapshotPokemon(original));
    restored.formStats!.blade.baseStats.ATK = 1;

    expect(original.formStats!.blade.baseStats.ATK).toBe(150);
  });
});
