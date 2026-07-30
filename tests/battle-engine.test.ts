import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';

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
        name: 'Dragonite',
        types: ['dragon', 'flying'],
        ability: 'multiscale',
        item: 'leftovers',
        baseStats: { HP: 91, ATK: 134, DEF: 95, SPATK: 100, SPDEF: 100, SPEED: 80 },
      });

      const result = engine.useMove(attacker, defender, new Move({
        name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10, category: 'physical',
      }));

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

      const result = engine.useMove(attacker, defender, new Move({
        name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical',
      }));

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
        name: 'Dragonite',
        types: ['dragon', 'flying'],
        ability: 'multiscale',
        item: 'leftovers',
        baseStats: { HP: 91, ATK: 134, DEF: 95, SPATK: 100, SPDEF: 100, SPEED: 80 },
      });

      const result = engine.useMove(attacker, defender, new Move({
        name: 'outrage', type: 'dragon', power: 120, category: 'physical',
      }));

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

      // Lv50: floor((102*2+31)*50/100)+5 = 122, choice-scarf x1.5 -> 183
      expect(engine.calculateSpeed(pokemon)).toBe(183);
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

  describe('orderBySpeed', () => {
    function makePokemonWithSpeed(name: string, speed: number): Pokemon {
      return new Pokemon({
        name,
        types: ['normal'],
        ability: 'run-away',
        item: null,
        baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: speed },
      });
    }

    test('orders entries from fastest to slowest', () => {
      const engine = new BattleEngine();
      const fast = makePokemonWithSpeed('Fast', 150);
      const slow = makePokemonWithSpeed('Slow', 50);

      const ordered = engine.orderBySpeed([
        { side: 1 as const, pokemon: slow },
        { side: 0 as const, pokemon: fast },
      ]);

      expect(ordered.map((e) => e.pokemon.name)).toEqual(['Fast', 'Slow']);
    });

    test('breaks exact speed ties randomly instead of always preserving input order', () => {
      const engine = new BattleEngine();
      const a = makePokemonWithSpeed('A', 100);
      const b = makePokemonWithSpeed('B', 100);

      const firstNames = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const ordered = engine.orderBySpeed([
          { side: 0 as const, pokemon: a },
          { side: 1 as const, pokemon: b },
        ]);
        firstNames.add(ordered[0].pokemon.name);
      }

      // 50回も回せば同速の乱数タイブレークにより両方が少なくとも1回は先頭に来るはず。
      expect(firstNames.size).toBe(2);
    });
  });

  describe('Stealth Rock', () => {
    test('should damage a switching-in Pokemon based on rock-type effectiveness', () => {
      const engine = new BattleEngine();
      engine.setStealthRock(1);

      const charizard = new Pokemon({
        name: 'Charizard',
        types: ['fire', 'flying'],
        ability: 'blaze',
        item: null,
        baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
      });

      engine.switchIn(charizard, [charizard], 1);

      // 4倍弱点(炎/飛行): maxHP/8 * 4 = maxHP/2
      expect(charizard.currentHP).toBe(charizard.maxHP - Math.floor(charizard.maxHP / 2));
    });

    test('should apply only a quarter of the base damage to a Pokemon quad-resistant to rock', () => {
      const engine = new BattleEngine();
      engine.setStealthRock(0);

      // じめん+はがねは岩を「ふあい・じめん・はがね」いずれも半減する2タイプが重なり4分の1耐性になる
      const excadrill = new Pokemon({
        name: 'Excadrill',
        types: ['ground', 'steel'],
        ability: 'mold-breaker',
        item: null,
        baseStats: { HP: 110, ATK: 135, DEF: 60, SPATK: 50, SPDEF: 65, SPEED: 88 },
      });

      engine.switchIn(excadrill, [excadrill], 0);

      // 地面・鋼はどちらも岩を半減: maxHP/8 * 0.5 * 0.5 = maxHP/32
      expect(excadrill.currentHP).toBe(excadrill.maxHP - Math.floor(excadrill.maxHP / 32));
    });
  });

  describe('Weather Damage', () => {
    test('should damage non-immune types at end of turn during sandstorm', () => {
      const engine = new BattleEngine();
      engine.weather = 'sand';
      engine.weatherTurnsLeft = 5;

      const sylveon = new Pokemon({
        name: 'Sylveon',
        types: ['fairy'],
        ability: 'pixilate',
        item: null,
        baseStats: { HP: 95, ATK: 65, DEF: 65, SPATK: 110, SPDEF: 130, SPEED: 60 },
      });

      engine.endTurn([sylveon], []);

      expect(sylveon.currentHP).toBe(sylveon.maxHP - Math.floor(sylveon.maxHP / 16));
    });

    test('should not damage rock/ground/steel types during sandstorm', () => {
      const engine = new BattleEngine();
      engine.weather = 'sand';
      engine.weatherTurnsLeft = 5;

      const cabaldon = new Pokemon({
        name: 'Cabaldon',
        types: ['ground'],
        ability: 'sand-stream',
        item: null,
        baseStats: { HP: 263, ATK: 135, DEF: 195, SPATK: 75, SPDEF: 135, SPEED: 65 },
      });

      engine.endTurn([cabaldon], []);

      expect(cabaldon.currentHP).toBe(cabaldon.maxHP);
    });
  });

  describe('PP Management', () => {
    test('should decrement PP by 1 on use', () => {
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
        item: null,
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });
      const move = new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 });

      engine.useMove(attacker, defender, move);

      expect(move.pp).toBe(9);
    });

    test('should decrement PP even when the move misses', () => {
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
        item: null,
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });
      const move = new Move({ name: 'stone-edge', type: 'rock', power: 100, accuracy: 0, pp: 5 });

      const result = engine.useMove(attacker, defender, move);

      expect(result.success).toBe(false);
      expect(move.pp).toBe(4);
    });

    test('should refuse to use a move with no PP left', () => {
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
        item: null,
        baseStats: { HP: 85, ATK: 50, DEF: 95, SPATK: 120, SPDEF: 115, SPEED: 80 },
      });
      const move = new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 });

      const result = engine.useMove(attacker, defender, move);

      expect(result.success).toBe(false);
      expect(move.pp).toBe(0);
      expect(defender.currentHP).toBe(defender.maxHP);
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

    const result = engine.useMove(teamA[0], teamB[0], new Move({
      name: 'earthquake', type: 'ground', power: 100, category: 'physical',
    }));

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
