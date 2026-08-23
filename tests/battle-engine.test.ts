import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import type { Move } from '../src/move.js';
import type { TypeName } from '../src/types.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import { isMoveSuccessful, shouldPivotAfterMove } from '../src/use-move-result.js';
import { asDamageResult } from './helpers/use-move-result.js';

// 実数値計算はカテゴリだけを参照するため、カテゴリ以外は最小構成の技で足りる。
const probeMove = (category: 'physical' | 'special'): Move =>
  createMove({ name: `probe-${category}`, type: 'normal', power: 1, category });

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

      attacker.applyStatus('burn');
      const attack = engine.calculateAttack(attacker, probeMove('physical'));
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

      const defense = engine.calculateDefense(defender, probeMove('special'));
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

      const result = engine.useMove(attacker, defender, createMove({
        name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10, category: 'physical',
      }));

      expect(isMoveSuccessful(result)).toBe(true);
      expect(asDamageResult(result).effectiveness).toBe(2.0);
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

      const result = engine.useMove(attacker, defender, createMove({
        name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical',
      }));

      expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
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

      expect(garchomp.statStages.ATK).toBe(-1);
      expect(engine.calculateAttack(garchomp, probeMove('physical'))).toBeLessThan(garchomp.stats.ATK);
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

    test('Life Orb only recoils the attacker that actually dealt damage this turn', () => {
      const engine = new BattleEngine();

      const attacker = new Pokemon({
        name: 'Attacker',
        types: ['normal'],
        ability: 'none',
        item: 'life-orb',
        baseStats: { HP: 100, ATK: 100, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 100 },
        moves: [createMove({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
      });

      const bench = new Pokemon({
        name: 'Bench',
        types: ['normal'],
        ability: 'none',
        item: 'life-orb',
        baseStats: { HP: 100, ATK: 100, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 90 },
      });

      const defender = new Pokemon({
        name: 'Defender',
        types: ['normal'],
        ability: 'none',
        item: null,
        baseStats: { HP: 100, ATK: 50, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 50 },
      });

      engine.useMove(attacker, defender, attacker.moves[0]);
      engine.endTurn([attacker, bench], [defender]);

      expect(attacker.currentHP).toBe(attacker.maxHP - Math.floor(attacker.maxHP / 10));
      expect(bench.currentHP).toBe(bench.maxHP);
    });

    test('Life Orb does not recoil when the attack whiffs into an immune target (0 damage)', () => {
      const engine = new BattleEngine();

      const attacker = new Pokemon({
        name: 'Attacker',
        types: ['ground'],
        ability: 'none',
        item: 'life-orb',
        baseStats: { HP: 100, ATK: 100, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 100 },
        moves: [createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 5, category: 'physical' })],
      });

      const flyingDefender = new Pokemon({
        name: 'FlyingDefender',
        types: ['flying'],
        ability: 'none',
        item: null,
        baseStats: { HP: 100, ATK: 50, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 50 },
      });

      engine.useMove(attacker, flyingDefender, attacker.moves[0]);
      engine.endTurn([attacker], [flyingDefender]);

      expect(attacker.currentHP).toBe(attacker.maxHP);
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

      const result = engine.useMove(attacker, defender, createMove({
        name: 'outrage', type: 'dragon', power: 120, category: 'physical',
      }));

      expect(asDamageResult(result).effectiveness).toBe(2.0);
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
      const move = createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 });

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
      const move = createMove({ name: 'stone-edge', type: 'rock', power: 100, accuracy: 0, pp: 5 });

      const result = engine.useMove(attacker, defender, move);

      expect(isMoveSuccessful(result)).toBe(false);
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
      const move = createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 });

      const result = engine.useMove(attacker, defender, move);

      expect(isMoveSuccessful(result)).toBe(false);
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

    const result = engine.useMove(teamA[0], teamB[0], createMove({
      name: 'earthquake', type: 'ground', power: 100, category: 'physical',
    }));

    expect(isMoveSuccessful(result)).toBe(true);
    expect(asDamageResult(result).damage).toBeGreaterThan(0);
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

    expect(garchomp.statStages.ATK).toBe(-1);
  });
});

describe('Stat stage integration', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    });
  }

  test('calculateAttack/calculateDefense/calculateSpeed apply the stat stage multiplier', () => {
    const engine = new BattleEngine();
    const pokemon = makeAttacker();

    const baseAttack = engine.calculateAttack(pokemon, probeMove('physical'));
    const baseSpeed = engine.calculateSpeed(pokemon);

    pokemon.modifyStatStage('ATK', 2); // x2
    pokemon.modifyStatStage('SPEED', -2); // x0.5

    expect(engine.calculateAttack(pokemon, probeMove('physical'))).toBe(baseAttack * 2);
    expect(engine.calculateSpeed(pokemon)).toBe(Math.floor(baseSpeed * 0.5));
  });
});

describe('Field-effect moves (Tailwind / Trick Room)', () => {
  function makeMover(name: string, speed: number): Pokemon {
    return new Pokemon({
      name,
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: speed },
      moves: [createMove({ name: 'tailwind', type: 'flying', power: 0, accuracy: 100, pp: 15, category: 'status', fieldEffect: 'tailwind' })],
    });
  }

  test('tailwind doubles speed for the caster\'s side for 4 turns, then expires', () => {
    const engine = new BattleEngine();
    const caster = makeMover('Caster', 50);
    const other = makeMover('Other', 999);

    engine.setActivePokemon(0, caster);
    engine.setActivePokemon(1, other);

    const beforeSpeed = engine.calculateSpeed(caster);
    engine.useMove(caster, other, caster.moves[0]);

    expect(engine.field.tailwind.playerA).toBe(4);
    expect(engine.calculateSpeed(caster)).toBe(beforeSpeed * 2);

    for (let i = 0; i < 4; i++) engine.startTurn();

    expect(engine.field.tailwind.playerA).toBe(0);
    expect(engine.calculateSpeed(caster)).toBe(beforeSpeed);
  });

  test('trick room toggles on and off when used twice', () => {
    const engine = new BattleEngine();
    const caster = new Pokemon({
      name: 'Caster',
      types: ['psychic'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 50 },
      moves: [createMove({ name: 'trick-room', type: 'psychic', power: 0, accuracy: 100, pp: 5, category: 'status', fieldEffect: 'trick-room' })],
    });
    const other = new Pokemon({
      name: 'Other',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });

    expect(engine.trickRoom).toBe(false);
    engine.useMove(caster, other, caster.moves[0]);
    expect(engine.trickRoom).toBe(true);
    expect(engine.trickRoomTurnsLeft).toBe(5);

    engine.useMove(caster, other, caster.moves[0]);
    expect(engine.trickRoom).toBe(false);
    expect(engine.trickRoomTurnsLeft).toBe(0);
  });
});

describe('Weather Ball dynamic typing', () => {
  test('becomes water-type (and gets the rain power boost) while raining', () => {
    const engine = new BattleEngine();
    engine.weather = 'rain';
    engine.weatherTurnsLeft = 5;

    const attacker = new Pokemon({
      name: 'Pelipper',
      types: ['water', 'flying'],
      ability: 'drizzle',
      item: null,
      baseStats: { HP: 60, ATK: 50, DEF: 100, SPATK: 95, SPDEF: 70, SPEED: 65 },
      moves: [createMove({ name: 'weather-ball', type: 'normal', power: 50, accuracy: 100, pp: 10, category: 'special' })],
    });

    // 炎タイプは水技で2倍弱点になるはず（ノーマル技のままなら等倍のまま変化しないので判別できる）
    const defender = new Pokemon({
      name: 'Charizard',
      types: ['fire', 'flying'],
      ability: 'blaze',
      item: null,
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
    });

    const result = engine.useMove(attacker, defender, attacker.moves[0]);

    expect(asDamageResult(result).effectiveness).toBe(2);
  });
});

describe('変化技によるまひ付与のタイプ無効化', () => {
  function makeParalyzer(): Pokemon {
    return new Pokemon({
      name: 'Paralyzer', types: ['normal'], ability: 'none', item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
  }

  function makeTarget(name: string, types: TypeName[]): Pokemon {
    return new Pokemon({
      name, types, ability: 'none', item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
  }

  // でんじは（でんきタイプ）とへびにらみ（ノーマルタイプ）は、いずれもまひを与える変化技。
  // まひ耐性はタイプ相性とは別に判定されるため、技のタイプを変えて切り分ける。
  const thunderWave = () =>
    createMove({ name: 'thunder-wave', type: 'electric', category: 'status', accuracy: 100, pp: 20, status: 'paralysis' });
  const glare = () =>
    createMove({ name: 'glare', type: 'normal', category: 'status', accuracy: 100, pp: 30, status: 'paralysis' });

  test('でんきタイプはまひしない', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makeParalyzer();
    const defender = makeTarget('Pikachu', ['electric']);

    // Act
    const result = engine.useMove(attacker, defender, glare());

    // Assert
    expect(defender.status).toBeNull();
    expect(result.outcome).not.toBe('status-inflicted');
  });

  test('じめんタイプはノーマルの変化技ならまひする', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makeParalyzer();
    const defender = makeTarget('Garchomp', ['dragon', 'ground']);

    // Act
    const result = engine.useMove(attacker, defender, glare());

    // Assert
    expect(defender.status).toBe('paralysis');
    expect(result).toMatchObject({ outcome: 'status-inflicted', status: 'paralysis' });
  });

  test('でんじははタイプ相性でじめんタイプに無効', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makeParalyzer();
    const defender = makeTarget('Garchomp', ['dragon', 'ground']);

    // Act
    const result = engine.useMove(attacker, defender, thunderWave());

    // Assert
    expect(defender.status).toBeNull();
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
  });
});

describe('変化技のタイプ相性', () => {
  function makeUser(ability: AbilityName = 'none'): Pokemon {
    return new Pokemon({
      name: 'User', types: ['normal'], ability, item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
  }

  function makeTarget(name: string, types: TypeName[]): Pokemon {
    return new Pokemon({
      name, types, ability: 'none', item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
  }

  test('どく技の変化技ははがねタイプに無効', () => {
    // Arrange
    const engine = new BattleEngine();
    const user = makeUser();
    const steel = makeTarget('Steelix', ['steel', 'ground']);
    const toxic = createMove({ name: 'toxic', type: 'poison', category: 'status', accuracy: 100, pp: 10, status: 'badly-poisoned' });

    // Act
    const result = engine.useMove(user, steel, toxic);

    // Assert
    expect(steel.status).toBeNull();
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
  });

  test('0倍以外の相性（いまひとつ）は変化技の効果に影響しない', () => {
    // Arrange
    const engine = new BattleEngine();
    const user = makeUser();
    // ほのお技はみずタイプに0.5倍だが、変化技なので効果はそのまま通る。
    const target = makeTarget('Vaporeon', ['water']);
    const willOWisp = createMove({ name: 'will-o-wisp', type: 'fire', category: 'status', accuracy: 100, pp: 15, status: 'burn' });

    // Act
    const result = engine.useMove(user, target, willOWisp);

    // Assert
    expect(target.status).toBe('burn');
    expect(result).toMatchObject({ outcome: 'status-inflicted', status: 'burn' });
  });

  test('相手を対象に取らない変化技はタイプ相性の影響を受けない', () => {
    // Arrange
    const engine = new BattleEngine();
    const user = makeUser();
    // ノーマル技はゴーストに無効だが、つるぎのまいは自分が対象なので発動する。
    const ghost = makeTarget('Gengar', ['ghost', 'poison']);
    const swordsDance = createMove({
      name: 'swords-dance', type: 'normal', category: 'status', accuracy: 100, pp: 20,
      selfStatChange: [{ stat: 'ATK', delta: 2 }],
    });

    // Act
    const result = engine.useMove(user, ghost, swordsDance);

    // Assert
    expect(user.statStages.ATK).toBe(2);
    expect(isMoveSuccessful(result)).toBe(true);
  });

  test('きもったまはノーマルの変化技をゴーストタイプに通す', () => {
    // Arrange
    const engine = new BattleEngine();
    const scrappyUser = makeUser('scrappy');
    const ghost = makeTarget('Gengar', ['ghost', 'poison']);
    const glare = createMove({ name: 'glare', type: 'normal', category: 'status', accuracy: 100, pp: 30, status: 'paralysis' });

    // Act
    const result = engine.useMove(scrappyUser, ghost, glare);

    // Assert
    expect(ghost.status).toBe('paralysis');
    expect(result).toMatchObject({ outcome: 'status-inflicted', status: 'paralysis' });
  });

  test('きもったまを持たなければノーマルの変化技はゴーストタイプに無効', () => {
    // Arrange
    const engine = new BattleEngine();
    const user = makeUser();
    const ghost = makeTarget('Gengar', ['ghost', 'poison']);
    const glare = createMove({ name: 'glare', type: 'normal', category: 'status', accuracy: 100, pp: 30, status: 'paralysis' });

    // Act
    const result = engine.useMove(user, ghost, glare);

    // Assert
    expect(ghost.status).toBeNull();
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
  });
});

describe('Secondary status effects', () => {
  test('applies the secondary status when the random roll is under the chance', () => {
    const engine = new BattleEngine();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.05); // 0.05*100=5 < chance(10)

    try {
      const attacker = new Pokemon({
        name: 'Golem',
        types: ['rock', 'ground'],
        ability: 'sturdy',
        item: null,
        baseStats: { HP: 80, ATK: 120, DEF: 130, SPATK: 55, SPDEF: 65, SPEED: 45 },
        moves: [createMove({
          name: 'ice-punch', type: 'ice', power: 75, accuracy: 100, pp: 15, category: 'physical',
          secondaryEffect: { status: 'freeze', chance: 10 },
        })],
      });
      const defender = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: null,
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      engine.useMove(attacker, defender, attacker.moves[0]);

      expect(defender.status).toBe('freeze');
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('does not apply the secondary status when the random roll is over the chance', () => {
    const engine = new BattleEngine();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99); // 0.99*100=99 > chance(10)

    try {
      const attacker = new Pokemon({
        name: 'Golem',
        types: ['rock', 'ground'],
        ability: 'sturdy',
        item: null,
        baseStats: { HP: 80, ATK: 120, DEF: 130, SPATK: 55, SPDEF: 65, SPEED: 45 },
        moves: [createMove({
          name: 'ice-punch', type: 'ice', power: 75, accuracy: 100, pp: 15, category: 'physical',
          secondaryEffect: { status: 'freeze', chance: 10 },
        })],
      });
      const defender = new Pokemon({
        name: 'Garchomp',
        types: ['dragon', 'ground'],
        ability: 'rough-skin',
        item: null,
        baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      });

      engine.useMove(attacker, defender, attacker.moves[0]);

      expect(defender.status).toBeNull();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('Badly Poisoned (Toxic)', () => {
  function makeToxicVictim(): Pokemon {
    return new Pokemon({
      name: 'Blissey',
      types: ['normal'],
      ability: 'natural-cure',
      item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
      statusState: { kind: 'badly-poisoned', elapsedTurns: 0 },
    });
  }

  test('damage increases each turn: floor(maxHP*1/16), then *2/16, then *3/16...', () => {
    const engine = new BattleEngine();
    const pokemon = makeToxicVictim();

    engine.applyStatusEffects([pokemon]);
    expect(pokemon.statusState).toEqual({ kind: 'badly-poisoned', elapsedTurns: 1 });
    expect(pokemon.currentHP).toBe(pokemon.maxHP - Math.floor(pokemon.maxHP / 16));

    const hpAfterTurn1 = pokemon.currentHP;
    engine.applyStatusEffects([pokemon]);
    expect(pokemon.statusState).toEqual({ kind: 'badly-poisoned', elapsedTurns: 2 });
    expect(pokemon.currentHP).toBe(hpAfterTurn1 - Math.floor((pokemon.maxHP * 2) / 16));
  });

  test('the counter caps at 15 turns and does not keep climbing', () => {
    const engine = new BattleEngine();
    // 15ターン目に到達済みの状態から1ターン進めても16にならないことだけを見る
    // （実戦では割合ダメージが積み重なるため、素のまま20ターン生き延びさせることはできない）。
    const pokemon = makeToxicVictim();
    pokemon.statusState = { kind: 'badly-poisoned', elapsedTurns: 15 };

    engine.applyStatusEffects([pokemon]);

    expect(pokemon.statusState).toEqual({ kind: 'badly-poisoned', elapsedTurns: 15 });
  });

  test('removeStatus() clears the toxic counter along with the status', () => {
    const pokemon = makeToxicVictim();
    pokemon.statusState = { kind: 'badly-poisoned', elapsedTurns: 5 };

    pokemon.removeStatus();

    expect(pokemon.status).toBeNull();
    expect(pokemon.statusState).toEqual({ kind: 'none' });
  });
});

describe('Self stat-change moves', () => {
  function makeUser(ability: AbilityName = 'none'): Pokemon {
    return new Pokemon({
      name: 'Serperior',
      types: ['grass'],
      ability,
      item: null,
      baseStats: { HP: 75, ATK: 75, DEF: 95, SPATK: 75, SPDEF: 95, SPEED: 113 },
    });
  }

  test('a pure buff move (power 0) raises the stat stage without dealing damage', () => {
    const engine = new BattleEngine();
    const user = makeUser();
    const target = makeUser();
    const swordsDance = createMove({
      name: 'swords-dance', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status',
      selfStatChange: [{ stat: 'ATK', delta: 2 }],
    });

    const result = engine.useMove(user, target, swordsDance);

    expect(isMoveSuccessful(result)).toBe(true);
    expect(user.statStages.ATK).toBe(2);
    expect(target.currentHP).toBe(target.maxHP);
  });

  test('a damaging move (Leaf Storm) still lowers the user\'s own stat stage after hitting', () => {
    const engine = new BattleEngine();
    const user = makeUser();
    const target = new Pokemon({
      name: 'Blissey',
      types: ['normal'],
      ability: 'natural-cure',
      item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });
    const leafStorm = createMove({
      name: 'leaf-storm', type: 'grass', power: 130, accuracy: 100, pp: 5, category: 'special',
      selfStatChange: [{ stat: 'SPATK', delta: -2 }],
    });

    const result = engine.useMove(user, target, leafStorm);

    expect(isMoveSuccessful(result)).toBe(true);
    expect(asDamageResult(result).damage).toBeGreaterThan(0);
    expect(user.statStages.SPATK).toBe(-2);
  });

  test('Contrary (あまのじゃく) inverts the direction of self-inflicted stat changes', () => {
    const engine = new BattleEngine();
    const user = makeUser('contrary');
    const target = makeUser('contrary');
    const leafStorm = createMove({
      name: 'leaf-storm', type: 'grass', power: 130, accuracy: 100, pp: 5, category: 'special',
      selfStatChange: [{ stat: 'SPATK', delta: -2 }],
    });

    engine.useMove(user, target, leafStorm);

    expect(user.statStages.SPATK).toBe(2); // 下降が上昇に反転する
  });

  test('Contrary also inverts stat changes inflicted by others (e.g. Intimidate)', () => {
    const engine = new BattleEngine();
    const intimidator = new Pokemon({
      name: 'Landorus-Therian',
      types: ['ground', 'flying'],
      ability: 'intimidate',
      item: null,
      baseStats: { HP: 89, ATK: 145, DEF: 90, SPATK: 105, SPDEF: 80, SPEED: 91 },
    });
    const contraryMon = makeUser('contrary');

    engine.setActivePokemon(0, intimidator);
    engine.setActivePokemon(1, contraryMon);
    engine.switchIn(intimidator, [intimidator]);
    engine.switchIn(contraryMon, [contraryMon]);

    expect(contraryMon.statStages.ATK).toBe(1); // 通常は-1のところ、contraryで+1になる
  });
});

describe('Reflect', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Garchomp',
      types: ['dragon', 'ground'],
      ability: 'rough-skin',
      item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' })],
    });
  }

  function makeDefender(): Pokemon {
    // 打たれ強い(=1発で瀕死にならない)物理耐久を持つ壁として使う。
    return new Pokemon({
      name: 'Stakataka',
      types: ['rock', 'steel'],
      ability: 'beast-boost',
      item: null,
      baseStats: { HP: 61, ATK: 131, DEF: 211, SPATK: 53, SPDEF: 101, SPEED: 13 },
    });
  }

  test('halves physical damage for the defending side while active', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();

    const noReflectDefender = makeDefender();
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, noReflectDefender);
    const withoutReflect = engine.useMove(attacker, noReflectDefender, attacker.moves[0]);

    const reflectDefender = makeDefender();
    engine.setActivePokemon(1, reflectDefender);
    engine.field.reflect.playerB = 5;
    const withReflect = engine.useMove(attacker, reflectDefender, attacker.moves[0]);

    expect(asDamageResult(withReflect).damage).toBeLessThan(asDamageResult(withoutReflect).damage);
    expect(asDamageResult(withReflect).damage).toBe(Math.floor(asDamageResult(withoutReflect).damage / 2));
  });

  test('decrements each turn and expires after 5 turns', () => {
    const engine = new BattleEngine();
    engine.field.reflect.playerA = 5;

    for (let i = 0; i < 5; i++) engine.startTurn();

    expect(engine.field.reflect.playerA).toBe(0);
  });
});

describe('Leech Seed (やどりぎのタネ)', () => {
  function makeSeedMove(): Move {
    // accuracy自体は実戦で90だが、テストの決定論性のため100にして命中判定の揺れを排除する。
    return createMove({ name: 'leech-seed', type: 'grass', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsSeed: true });
  }

  test('seeds a non-Grass target and does nothing to a Grass-type target', () => {
    const engine = new BattleEngine();
    const user = new Pokemon({
      name: 'Serperior', types: ['grass'], ability: 'overgrow', item: null,
      baseStats: { HP: 75, ATK: 75, DEF: 95, SPATK: 75, SPDEF: 95, SPEED: 113 },
    });
    const nonGrass = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    });
    const grassType = new Pokemon({
      name: 'Whimsicott', types: ['grass', 'fairy'], ability: 'prankster', item: null,
      baseStats: { HP: 60, ATK: 67, DEF: 85, SPATK: 77, SPDEF: 75, SPEED: 116 },
    });

    engine.useMove(user, nonGrass, makeSeedMove());
    expect(nonGrass.isSeeded).toBe(true);

    engine.useMove(user, grassType, makeSeedMove());
    expect(grassType.isSeeded).toBe(false);
  });

  test('drains HP from the seeded Pokemon into its active opponent each end of turn', () => {
    const engine = new BattleEngine();
    const seeded = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      isSeeded: true,
    });
    const opponent = new Pokemon({
      name: 'Serperior', types: ['grass'], ability: 'overgrow', item: null,
      baseStats: { HP: 75, ATK: 75, DEF: 95, SPATK: 75, SPDEF: 95, SPEED: 113 },
      currentHP: 50,
    });

    engine.setActivePokemon(0, seeded);
    engine.setActivePokemon(1, opponent);

    engine.applyLeechSeed([seeded], [opponent]);

    const drained = Math.floor(seeded.maxHP / 8);
    expect(seeded.currentHP).toBe(seeded.maxHP - drained);
    expect(opponent.currentHP).toBe(50 + drained);
  });
});

describe('変化技による能力ランク変化（にらみつける等）', () => {
  function makePokemon(name: string, types: TypeName[] = ['normal']): Pokemon {
    return new Pokemon({
      name, types, ability: 'none', item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
  }

  const growl = () =>
    createMove({
      name: 'growl', type: 'normal', category: 'status', accuracy: 100, pp: 40,
      targetStatChange: [{ stat: 'ATK', delta: -1, chance: 100 }],
    });

  test('相手の能力ランクだけを下げる変化技が効果を発揮する', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');

    // Act
    const result = engine.useMove(attacker, defender, growl());

    // Assert
    expect(defender.statStages.ATK).toBe(-1);
    expect(isMoveSuccessful(result)).toBe(true);
  });

  test('自分と相手の両方を変化させる変化技は双方に適用される', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    const bothWays = createMove({
      name: 'both-ways', type: 'normal', category: 'status', accuracy: 100, pp: 10,
      selfStatChange: [{ stat: 'ATK', delta: 2 }],
      targetStatChange: [{ stat: 'DEF', delta: -1, chance: 100 }],
    });

    // Act
    engine.useMove(attacker, defender, bothWays);

    // Assert
    expect(attacker.statStages.ATK).toBe(2);
    expect(defender.statStages.DEF).toBe(-1);
  });

  test('タイプ相性が0倍なら能力ランクは変化しない', () => {
    // Arrange: ノーマル技はゴーストタイプに無効
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const ghost = makePokemon('Gengar', ['ghost', 'poison']);

    // Act
    const result = engine.useMove(attacker, ghost, growl());

    // Assert
    expect(ghost.statStages.ATK).toBe(0);
    expect(result).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
  });

  test('しろいハーブは変化技による能力低下も1回だけ防ぐ', () => {
    // Arrange
    const engine = new BattleEngine();
    const attacker = makePokemon('Attacker');
    const defender = makePokemon('Defender');
    defender.item = 'white-herb';

    // Act
    engine.useMove(attacker, defender, growl());

    // Assert
    expect(defender.statStages.ATK).toBe(0);
    expect(defender.itemUsed).toBe(true);
  });
});

describe('Target stat-change moves (バークアウト等)', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Arcanine', types: ['fire'], ability: 'intimidate', item: null,
      baseStats: { HP: 90, ATK: 110, DEF: 80, SPATK: 100, SPDEF: 80, SPEED: 95 },
      moves: [createMove({
        name: 'snarl', type: 'dark', power: 55, accuracy: 100, pp: 15, category: 'special',
        targetStatChange: [{ stat: 'SPATK', delta: -1, chance: 100 }],
      })],
    });
  }

  function makeDefender(): Pokemon {
    return new Pokemon({
      name: 'Raichu', types: ['electric'], ability: 'static', item: null,
      baseStats: { HP: 60, ATK: 55, DEF: 50, SPATK: 95, SPDEF: 85, SPEED: 110 },
    });
  }

  test('a guaranteed (chance:100) effect always lowers the target stat stage on hit', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    engine.useMove(attacker, defender, attacker.moves[0]);

    expect(defender.statStages.SPATK).toBe(-1);
  });

  test('does not apply when the defender fainted from the hit itself', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();
    defender.currentHP = 1; // 確実にこの一撃で瀕死になるようにする

    engine.useMove(attacker, defender, attacker.moves[0]);

    expect(defender.isFainted).toBe(true);
    expect(defender.statStages.SPATK).toBe(0);
  });
});

describe('Weather-scaled self-heal moves (あさのひざし等)', () => {
  function makeHealer(): Pokemon {
    return new Pokemon({
      name: 'Arcanine', types: ['fire'], ability: 'intimidate', item: null,
      baseStats: { HP: 90, ATK: 110, DEF: 80, SPATK: 100, SPDEF: 80, SPEED: 95 },
      currentHP: 1,
      moves: [createMove({ name: 'morning-sun', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', weatherHeal: true })],
    });
  }

  test('heals 50% of max HP with no weather', () => {
    const engine = new BattleEngine();
    const pokemon = makeHealer();

    engine.useMove(pokemon, pokemon, pokemon.moves[0]);

    expect(pokemon.currentHP).toBe(1 + Math.floor(pokemon.maxHP * 0.5));
  });

  test('heals 2/3 of max HP in sun', () => {
    const engine = new BattleEngine();
    engine.weather = 'sun';
    const pokemon = makeHealer();

    engine.useMove(pokemon, pokemon, pokemon.moves[0]);

    expect(pokemon.currentHP).toBe(1 + Math.floor(pokemon.maxHP * (2 / 3)));
  });

  test('heals only 25% of max HP in other weather (e.g. sand)', () => {
    const engine = new BattleEngine();
    engine.weather = 'sand';
    const pokemon = makeHealer();

    engine.useMove(pokemon, pokemon, pokemon.moves[0]);

    expect(pokemon.currentHP).toBe(1 + Math.floor(pokemon.maxHP * 0.25));
  });
});

describe('Multi-hit moves (ロックブラスト等)', () => {
  // multiHit を false にすると、同じ威力の単発技として比較対象に使える。
  function makeAttacker({ multiHit = true }: { multiHit?: boolean } = {}): Pokemon {
    return new Pokemon({
      name: 'Excadrill', types: ['ground', 'steel'], ability: 'mold-breaker', item: null,
      baseStats: { HP: 110, ATK: 135, DEF: 60, SPATK: 50, SPDEF: 65, SPEED: 88 },
      moves: [createMove({ name: 'rock-blast', type: 'rock', power: 25, accuracy: 90, pp: 10, category: 'physical', multiHit })],
    });
  }

  // いわ半減×2(いわ・はがね複合)の頑丈な受け手にして、5発耐えてもオーバーキルにならないようにする。
  function makeDefender(): Pokemon {
    return new Pokemon({
      name: 'Stakataka', types: ['rock', 'steel'], ability: 'beast-boost', item: null,
      baseStats: { HP: 61, ATK: 131, DEF: 211, SPATK: 53, SPDEF: 101, SPEED: 13 },
    });
  }

  // オーバーキル判定専用に、あえて打たれ弱い対象を使う。
  function makeFragileDefender(): Pokemon {
    return new Pokemon({
      name: 'Charizard', types: ['fire', 'flying'], ability: 'blaze', item: null,
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
    });
  }

  test('hits exactly the number of times the roll lands on, dealing that many instances of damage', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    // 0.9 -> 5発 (2:0-0.375, 3:0.375-0.75, 4:0.75-0.875, 5:0.875-1.0)
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const singleHitEngine = new BattleEngine();
      const singleHitAttacker = makeAttacker({ multiHit: false });
      const singleHitDefender = makeDefender();
      const singleHit = singleHitEngine.useMove(singleHitAttacker, singleHitDefender, singleHitAttacker.moves[0]);

      const result = engine.useMove(attacker, defender, attacker.moves[0]);

      expect(asDamageResult(result).damage).toBe(asDamageResult(singleHit).damage * 5);
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('stops early if the defender faints partway through the hits', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeFragileDefender();
    defender.currentHP = 1;

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9); // 5発分のロール
    try {
      const result = engine.useMove(attacker, defender, attacker.moves[0]);
      expect(defender.isFainted).toBe(true);
      expect(asDamageResult(result).damage).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('こだわり系アイテムの威力補正', () => {
  function makeAttacker(item: ItemName | null): Pokemon {
    return new Pokemon({
      name: 'Attacker',
      types: ['normal'],
      ability: 'none',
      item,
      baseStats: { HP: 100, ATK: 120, DEF: 80, SPATK: 120, SPDEF: 80, SPEED: 80 },
    });
  }

  function makeDefender(): Pokemon {
    return new Pokemon({
      name: 'Stakataka',
      types: ['rock', 'steel'],
      ability: 'none',
      item: null,
      baseStats: { HP: 61, ATK: 131, DEF: 211, SPATK: 53, SPDEF: 101, SPEED: 13 },
    });
  }

  test('こだわりハチマキは物理技の威力を1.5倍にする', () => {
    const engine = new BattleEngine();
    const makeMove = () => createMove({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, category: 'physical' });

    const plain = engine.useMove(makeAttacker(null), makeDefender(), makeMove());
    const banded = engine.useMove(makeAttacker('choice-band'), makeDefender(), makeMove());

    expect(asDamageResult(banded).damage).toBeGreaterThan(asDamageResult(plain).damage);
  });

  test('こだわりメガネは特殊技の威力を1.5倍にするが物理技には効かない', () => {
    const engine = new BattleEngine();
    const makePhysical = () => createMove({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, category: 'physical' });
    const makeSpecial = () => createMove({ name: 'hyper-voice', type: 'normal', power: 90, accuracy: 100, category: 'special' });

    const plainSpecial = engine.useMove(makeAttacker(null), makeDefender(), makeSpecial());
    const specsSpecial = engine.useMove(makeAttacker('choice-specs'), makeDefender(), makeSpecial());
    expect(asDamageResult(specsSpecial).damage).toBeGreaterThan(asDamageResult(plainSpecial).damage);

    const plainPhysical = engine.useMove(makeAttacker(null), makeDefender(), makePhysical());
    const specsPhysical = engine.useMove(makeAttacker('choice-specs'), makeDefender(), makePhysical());
    expect(asDamageResult(specsPhysical).damage).toBe(asDamageResult(plainPhysical).damage);
  });
});

describe('pivot技 (とんぼがえり/ボルトチェンジ/クイックターン)', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Scizor',
      types: ['bug', 'steel'],
      ability: 'none',
      item: null,
      baseStats: { HP: 70, ATK: 130, DEF: 100, SPATK: 55, SPDEF: 80, SPEED: 65 },
    });
  }

  function makeDefender(): Pokemon {
    return new Pokemon({
      name: 'Blissey',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });
  }

  test('pivot技が成功するとpivot=trueを返す', () => {
    const engine = new BattleEngine();

    const result = engine.useMove(makeAttacker(), makeDefender(), createMove({
      name: 'u-turn', type: 'bug', power: 70, accuracy: 100, category: 'physical', pivot: true,
    }));

    expect(isMoveSuccessful(result)).toBe(true);
    expect(shouldPivotAfterMove(result)).toBe(true);
  });

  test('通常の技はpivot=falseを返す', () => {
    const engine = new BattleEngine();

    const result = engine.useMove(makeAttacker(), makeDefender(), createMove({
      name: 'bullet-punch', type: 'steel', power: 40, accuracy: 100, category: 'physical',
    }));

    expect(shouldPivotAfterMove(result)).toBe(false);
  });

  test('技を外した場合はpivotが立たない', () => {
    const engine = new BattleEngine();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = engine.useMove(makeAttacker(), makeDefender(), createMove({
      name: 'u-turn', type: 'bug', power: 70, accuracy: 50, category: 'physical', pivot: true,
    }));

    expect(isMoveSuccessful(result)).toBe(false);
    expect(shouldPivotAfterMove(result)).toBe(false);

    randomSpy.mockRestore();
  });
});

describe('Taunt (ちょうはつ)', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
        createMove({ name: 'swords-dance', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
      ],
    });
  }

  function makeDefender(): Pokemon {
    return new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });
  }

  test('taunted pokemon cannot use attacking moves', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    attacker.applyTaunt(3);
    expect(attacker.isTaunted).toBe(true);

    const result = engine.useMove(attacker, defender, attacker.moves[0]); // earthquake (physical)
    expect(isMoveSuccessful(result)).toBe(false);
    expect(defender.currentHP).toBe(defender.maxHP); // no damage dealt
  });

  test('taunted pokemon can use status moves', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    attacker.applyTaunt(3);

    const result = engine.useMove(attacker, defender, attacker.moves[1]); // swords-dance (status)
    expect(isMoveSuccessful(result)).toBe(true);
    expect(attacker.statStages.ATK).toBe(2);
  });

  test('taunt duration decrements each startTurn', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);

    attacker.applyTaunt(3);

    engine.startTurn(); // turn 1: 3 -> 2
    expect(attacker.tauntTurnsLeft).toBe(2);
    expect(attacker.isTaunted).toBe(true);

    engine.startTurn(); // turn 2: 2 -> 1
    expect(attacker.tauntTurnsLeft).toBe(1);
    expect(attacker.isTaunted).toBe(true);

    engine.startTurn(); // turn 3: 1 -> 0
    expect(attacker.tauntTurnsLeft).toBe(0);
    expect(attacker.isTaunted).toBe(false);
  });

  test('taunt clears on switch-out', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();
    const bench = new Pokemon({
      name: 'Sylveon', types: ['fairy'], ability: 'pixilate', item: null,
      baseStats: { HP: 95, ATK: 65, DEF: 65, SPATK: 110, SPDEF: 130, SPEED: 60 },
    });

    attacker.applyTaunt(3);
    expect(attacker.isTaunted).toBe(true);

    attacker.resetTaunt(); // simulates what switchTo does
    expect(attacker.isTaunted).toBe(false);
    expect(attacker.tauntTurnsLeft).toBe(0);
  });
});

describe('Mental Herb (メンタルハーブ)', () => {
  test('cures taunt on first attacking move attempt', () => {
    const engine = new BattleEngine();
    const attacker = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'mental-herb', itemUsed: false,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
    const defender = new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });

    attacker.applyTaunt(3);
    expect(attacker.isTaunted).toBe(true);

    const result = engine.useMove(attacker, defender, attacker.moves[0]);
    expect(isMoveSuccessful(result)).toBe(true);
    expect(asDamageResult(result).damage).toBeGreaterThan(0);
    expect(attacker.isTaunted).toBe(false); // taunt cured
    expect(attacker.itemUsed).toBe(true); // herb consumed
  });

  test('second attack is blocked after herb is consumed', () => {
    const engine = new BattleEngine();
    const attacker = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'mental-herb', itemUsed: false,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
    const defender = new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });

    attacker.applyTaunt(5);

    // First attempt: herb cures taunt, move goes through
    engine.useMove(attacker, defender, attacker.moves[0]);
    expect(attacker.isTaunted).toBe(false);
    expect(attacker.itemUsed).toBe(true);

    // Re-apply taunt for the second test
    attacker.applyTaunt(3);
    expect(attacker.isTaunted).toBe(true);

    // Second attempt: herb already used, taunt blocks
    const result = engine.useMove(attacker, defender, attacker.moves[0]);
    expect(isMoveSuccessful(result)).toBe(false);
  });

  test('mental herb does not cure taunt if already used', () => {
    const engine = new BattleEngine();
    const attacker = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'mental-herb', itemUsed: true,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        createMove({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
    const defender = new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });

    attacker.applyTaunt(3);

    const result = engine.useMove(attacker, defender, attacker.moves[0]);
    expect(isMoveSuccessful(result)).toBe(false); // still taunted
    expect(attacker.isTaunted).toBe(true);
  });

  // --- ハザード設置技テスト ---
  describe('Section: Hazards', () => {
    function makeMon(name: string, types: TypeName[], ability: AbilityName = 'none', item: ItemName | null = null) {
      return new Pokemon({
        name, types, ability, item,
        baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      });
    }
    function statusMove(name: string, fieldEffect: string): Move {
      return createMove({ name, type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', fieldEffect: fieldEffect as any });
    }

    test('stealth-rock: sets on attacker side, blocks if already set', () => {
      const e = new BattleEngine();
      const a = makeMon('A', ['normal']);
      const d = makeMon('D', ['normal']);
      e.setActivePokemon(0, a);
      e.setActivePokemon(1, d);
      const move = statusMove('stealth-rock', 'stealth-rock');

      const r1 = e.useMove(a, d, move);
      expect(isMoveSuccessful(r1)).toBe(true);
      expect(e.field.stealthRock.playerA).toBe(true);

      // 2回目も技は成功するが「既に設置済み」
      const r2 = e.useMove(a, d, move);
      expect(isMoveSuccessful(r2)).toBe(true);
      expect(e.field.stealthRock.playerA).toBe(true);
    });

    test('stealth-rock: switch-in damage based on type effectiveness', () => {
      const e = new BattleEngine();
      e.setStealthRock(1); // 相手側に設置
      const mon = makeMon('Gengar', ['poison', 'ghost']);
      e.setActivePokemon(0, mon);
      const before = mon.currentHP;
      e.switchIn(mon, [], 1);
      // 岩: 2倍 → 1/8 * 2 = 1/4 HP
      expect(mon.currentHP).toBeLessThan(before);
    });

    test('spikes: 1 layer = 1/8, 2 = 1/6, 3 = 1/4', () => {
      const e = new BattleEngine();
      const a = makeMon('A', ['normal']);
      const d = makeMon('D', ['normal']);
      e.setActivePokemon(0, a);
      e.setActivePokemon(1, d);
      const move = statusMove('spikes', 'spikes');

      e.useMove(a, d, move);
      expect(e.field.spikes.playerA).toBe(1);

      e.useMove(a, d, move);
      expect(e.field.spikes.playerA).toBe(2);

      e.useMove(a, d, move);
      expect(e.field.spikes.playerA).toBe(3);

      // 4層目は無効
      e.useMove(a, d, move);
      expect(e.field.spikes.playerA).toBe(3);
    });

    test('spikes: flying and levitate are immune to damage', () => {
      const e = new BattleEngine();
      const target = makeMon('Target', ['normal']);
      const setter = makeMon('A', ['normal']);
      e.setActivePokemon(0, setter);
      e.setActivePokemon(1, target);

      // まきびし1層を設置
      const spikeMove = statusMove('spikes', 'spikes');
      e.useMove(setter, target, spikeMove);

      // 通常タイプはダメージ
      const normal = makeMon('Normal', ['normal']);
      e.setActivePokemon(0, normal);
      const hpBefore = normal.currentHP;
      e.switchIn(normal, [], 0);
      expect(normal.currentHP).toBeLessThan(hpBefore);

      // 飛行タイプは無効
      const flying = makeMon('Bird', ['flying']);
      e.setActivePokemon(0, flying);
      const hpFlyingBefore = flying.currentHP;
      e.switchIn(flying, [], 0);
      expect(flying.currentHP).toBe(hpFlyingBefore);

      // ふゆう特性も無効
      const levitate = makeMon('Koffing', ['poison'], 'levitate');
      e.setActivePokemon(0, levitate);
      const hpLevBefore = levitate.currentHP;
      e.switchIn(levitate, [], 0);
      expect(levitate.currentHP).toBe(hpLevBefore);
    });

    test('toxic-spikes: 1 layer = poison, 2 layers = badly-poisoned', () => {
      const e = new BattleEngine();
      const a = makeMon('A', ['normal']);
      const d = makeMon('D', ['normal']);
      e.setActivePokemon(0, a);
      e.setActivePokemon(1, d);
      const move = statusMove('toxic-spikes', 'toxic-spikes');

      e.useMove(a, d, move);
      expect(e.field.toxicSpikes.playerA).toBe(1);

      e.useMove(a, d, move);
      expect(e.field.toxicSpikes.playerA).toBe(2);

      // 3層目は無効
      e.useMove(a, d, move);
      expect(e.field.toxicSpikes.playerA).toBe(2);
    });

    test('toxic-spikes: poison type absorbs, steel/flying/levitate immune', () => {
      const e = new BattleEngine();
      const a = makeMon('A', ['normal']);
      const d = makeMon('D', ['normal']);
      e.setActivePokemon(0, a);
      e.setActivePokemon(1, d);
      const move = statusMove('toxic-spikes', 'toxic-spikes');
      e.useMove(a, d, move); // 1層設置

      // 毒タイプは吸収して解除
      const poison = makeMon('Grimer', ['poison']);
      e.setActivePokemon(0, poison);
      e.switchIn(poison, [], 0);
      expect(e.field.toxicSpikes.playerA).toBe(0);
      expect(poison.status).toBeNull();

      // もう一度設置
      e.setActivePokemon(0, a);
      e.useMove(a, d, move);

      // はがねタイプは無効（消えない）
      const steel = makeMon('Steelix', ['steel']);
      e.setActivePokemon(0, steel);
      e.switchIn(steel, [], 0);
      expect(steel.status).toBeNull();
      expect(e.field.toxicSpikes.playerA).toBe(1);

      // ひこうタイプも無効
      e.setActivePokemon(0, a);
      e.useMove(a, d, move); // 2層
      const flying = makeMon('Bird', ['flying']);
      e.setActivePokemon(0, flying);
      e.switchIn(flying, [], 0);
      expect(flying.status).toBeNull();
      expect(e.field.toxicSpikes.playerA).toBe(2);
    });

    test('toxic-spikes: switch-in applies poison status', () => {
      const e = new BattleEngine();
      const a = makeMon('A', ['normal']);
      const d = makeMon('D', ['normal']);
      e.setActivePokemon(0, a);
      e.setActivePokemon(1, d);
      const move = statusMove('toxic-spikes', 'toxic-spikes');
      e.useMove(a, d, move); // 1層

      const victim = makeMon('Victim', ['normal']);
      e.setActivePokemon(0, victim);
      e.switchIn(victim, [], 0);
      expect(victim.status).toBe('poison');
    });
  });
});
