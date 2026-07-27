import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import type { BaseStats, MoveData, TypeName } from '../src/types.js';

describe('BattleEngine', () => {
  let engine: BattleEngine;

  beforeEach(() => {
    engine = new BattleEngine();
  });

  describe('Section: Attack Calculation', () => {
    test('should apply burn reduction to physical attacks', () => {
      const attacker = new Pokemon({
        name: 'Charizard',
        types: ['fire', 'flying'],
        ability: 'blaze',
        item: null,
        baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
      });

      attacker.status = 'burn';
      const attack = engine.calculateAttack(attacker, { category: 'physical' });
      expect(attack).toBeLessThan(120);
    });
  });

  describe('Section: Defense Calculation', () => {
    test('should calculate defense correctly', () => {
      const defender = new Pokemon({
        name: 'Sylveon',
        types: ['fairy'],
        ability: 'pixilate',
        item: 'choice-specs',
        baseStats: { HP: 95, ATK: 65, DEF: 65, SPATK: 110, SPDEF: 130, SPEED: 60 },
      });

      const defense = engine.calculateDefense(defender, { category: 'special' });
      expect(defense).toBeGreaterThan(0);
    });
  });

  describe('Section: Damage Calculation', () => {
    test('should calculate super effective damage', () => {
      const engine = new BattleEngine();

      const attacker = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      const defender = new Pokemon({
        name: 'Togekiss',
        types: ['fairy', 'flying'],
        ability: 'serene-grace',
        item: 'leftovers',
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });

      const result = engine.useMove(attacker, defender, {
        name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10, category: 'physical',
      });

      expect(result.success).toBe(true);
      expect(result.effectiveness).toBe(2.0);
    });

    test('should handle immunity', () => {
      const engine = new BattleEngine();

      const attacker = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: null,
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      const defender = new Pokemon({
        name: 'Togekiss',
        types: ['fairy', 'flying'],
        ability: 'serene-grace',
        item: 'leftovers',
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });

      const result = engine.useMove(attacker, defender, {
        name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical',
      });

      expect(result.effectiveness).toBe(0);
    });
  });

  describe('Abilities', () => {
    test('should activate intimidate on switch-in', () => {
      const engine = new BattleEngine();

      const landorus = new Pokemon({
        name: 'Landorus-Therian',
        types: ['ground', 'flying'],
        ability: 'intimidate',
        item: 'choice-scarf',
        baseStats: { HP: 89, ATK: 145, DEF: 90, SPATK: 105, SPDEF: 80, SPEED: 91 },
      });

      const garchomp = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      engine.setActivePokemon(0, landorus);
      engine.setActivePokemon(1, garchomp);

      engine.switchIn(landorus, [landorus]);
      engine.switchIn(garchomp, [garchomp]);

      expect(garchomp.stats.ATK).toBeLessThan(130);
    });
  });

  describe('Items', () => {
    test('should activate Focus Sash', () => {
      const engine = new BattleEngine();
      const defender = new Pokemon({
        name: 'Shedinja',
        types: ['bug', 'ghost'],
        ability: 'wonder-guard',
        item: 'focus-sash',
        baseStats: { HP: 1, ATK: 90, DEF: 45, SPATK: 30, SPDEF: 30, SPEED: 40 },
      });

      defender.takeDamage(100, engine);
      expect(defender.currentHP).toBe(1);
      expect(defender.itemUsed).toBe(true);
    });
  });

  describe('Type Effectiveness', () => {
    test('should calculate super effective damage', () => {
      const engine = new BattleEngine();

      const attacker = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      const defender = new Pokemon({
        name: 'Togekiss',
        types: ['fairy', 'flying'],
        ability: 'serene-grace',
        item: 'leftovers',
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });

      const result = engine.useMove(attacker, defender, {
        name: 'outrage', type: 'dragon', power: 120, category: 'physical',
      });

      expect(result.effectiveness).toBe(2.0);
    });

    test('should handle immunity', () => {
      const engine = new BattleEngine();

      // Ground attack vs Flying type = 0x effectiveness
      const effectiveness = engine.getTypeEffectiveness('ground', ['flying']);
      expect(effectiveness).toBe(0);

      // Normal attack vs Ghost type = 0x effectiveness
      const effectiveness2 = engine.getTypeEffectiveness('normal', ['ghost']);
      expect(effectiveness2).toBe(0);
    });
  });

  describe('Speed Calculation', () => {
    test('should apply Choice Scarf boost', () => {
      const engine = new BattleEngine();
      const pokemon = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      expect(engine.calculateSpeed(pokemon)).toBe(153);
    });

    test('should handle Trick Room speed reversal', () => {
      const engine = new BattleEngine();
      engine.trickRoom = true;

      const fastPokemon = new Pokemon({
        name: 'Regieleki',
        types: ['electric'],
        ability: 'transistor',
        item: null,
        baseStats: { HP: 80, ATK: 100, DEF: 50, SPATK: 100, SPDEF: 50, SPEED: 200 },
      });

      const slowPokemon = new Pokemon({
        name: 'Shuckle',
        types: ['bug', 'rock'],
        ability: 'sturdy',
        item: null,
        baseStats: { HP: 20, ATK: 10, DEF: 230, SPATK: 10, SPDEF: 230, SPEED: 5 },
      });

      expect(engine.calculateSpeed(fastPokemon)).toBeLessThan(engine.calculateSpeed(slowPokemon));
    });
  });
});

describe('Integration Tests', () => {
  test('should simulate a complete battle turn', () => {
    const engine = new BattleEngine();

    const teamA = [
      new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      }),
      new Pokemon({
        name: 'Sylveon',
        types: ['fairy'],
        ability: 'pixilate',
        item: 'choice-specs',
        baseStats: { HP: 95, ATK: 65, DEF: 65, SPATK: 110, SPDEF: 130, SPEED: 60 },
      }),
    ];

    const teamB = [
      new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: 'choice-scarf',
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      }),
      new Pokemon({
        name: 'Sylveon',
        types: ['fairy'],
        ability: 'pixilate',
        item: 'choice-specs',
        baseStats: { HP: 95, ATK: 65, DEF: 65, SPATK: 110, SPDEF: 130, SPEED: 60 },
      }),
    ];

    engine.switchIn(teamA[0], teamA);
    engine.switchIn(teamB[0], teamB);

    engine.startTurn();

    const result = engine.useMove(teamA[0], teamB[0], {
      name: 'earthquake', type: 'ground', power: 100, category: 'physical',
    });

    expect(result.success).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(engine.turn).toBe(1);
  });

  test('should handle switch-in with ability activation', () => {
    const engine = new BattleEngine();

    const landorus = new Pokemon({
      name: 'Landorus-Therian',
      types: ['ground', 'flying'],
      ability: 'intimidate',
      item: 'choice-scarf',
      baseStats: { HP: 89, ATK: 145, DEF: 90, SPATK: 105, SPDEF: 80, SPEED: 91 },
    });

    const garchomp = new Pokemon({
      name: 'Garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: 'choice-scarf',
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    });

    engine.setActivePokemon(0, landorus);
    engine.setActivePokemon(1, garchomp);

    engine.switchIn(landorus, [landorus]);
    engine.switchIn(garchomp, [garchomp]);

    expect(garchomp.stats.ATK).toBeLessThan(130);
  });
});
