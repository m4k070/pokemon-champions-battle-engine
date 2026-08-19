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

      expect(garchomp.statStages.ATK).toBe(-1);
      expect(engine.calculateAttack(garchomp, { category: 'physical' })).toBeLessThan(garchomp.stats.ATK);
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
        moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
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
        moves: [new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 5, category: 'physical' })],
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

    const baseAttack = engine.calculateAttack(pokemon, { category: 'physical' });
    const baseSpeed = engine.calculateSpeed(pokemon);

    pokemon.modifyStatStage('ATK', 2); // x2
    pokemon.modifyStatStage('SPEED', -2); // x0.5

    expect(engine.calculateAttack(pokemon, { category: 'physical' })).toBe(baseAttack * 2);
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
      moves: [new Move({ name: 'tailwind', type: 'flying', power: 0, accuracy: 100, pp: 15, category: 'status', fieldEffect: 'tailwind' })],
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
      moves: [new Move({ name: 'trick-room', type: 'psychic', power: 0, accuracy: 100, pp: 5, category: 'status', fieldEffect: 'trick-room' })],
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
      moves: [new Move({ name: 'weather-ball', type: 'normal', power: 50, accuracy: 100, pp: 10, category: 'special' })],
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

    expect(result.effectiveness).toBe(2);
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
        moves: [new Move({
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
        moves: [new Move({
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
      status: 'badly-poisoned',
    });
  }

  test('damage increases each turn: floor(maxHP*1/16), then *2/16, then *3/16...', () => {
    const engine = new BattleEngine();
    const pokemon = makeToxicVictim();

    engine.applyStatusEffects([pokemon]);
    expect(pokemon.toxicCounter).toBe(1);
    expect(pokemon.currentHP).toBe(pokemon.maxHP - Math.floor(pokemon.maxHP / 16));

    const hpAfterTurn1 = pokemon.currentHP;
    engine.applyStatusEffects([pokemon]);
    expect(pokemon.toxicCounter).toBe(2);
    expect(pokemon.currentHP).toBe(hpAfterTurn1 - Math.floor((pokemon.maxHP * 2) / 16));
  });

  test('the counter caps at 15 turns and does not keep climbing', () => {
    const engine = new BattleEngine();
    // 15ターン目に到達済みの状態から1ターン進めても16にならないことだけを見る
    // （実戦では割合ダメージが積み重なるため、素のまま20ターン生き延びさせることはできない）。
    const pokemon = makeToxicVictim();
    pokemon.toxicCounter = 15;

    engine.applyStatusEffects([pokemon]);

    expect(pokemon.toxicCounter).toBe(15);
  });

  test('removeStatus() clears the toxic counter along with the status', () => {
    const pokemon = makeToxicVictim();
    pokemon.toxicCounter = 5;

    pokemon.removeStatus();

    expect(pokemon.status).toBeNull();
    expect(pokemon.toxicCounter).toBe(0);
  });
});

describe('Self stat-change moves', () => {
  function makeUser(ability = 'none'): Pokemon {
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
    const swordsDance = new Move({
      name: 'swords-dance', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status',
      selfStatChange: [{ stat: 'ATK', delta: 2 }],
    });

    const result = engine.useMove(user, target, swordsDance);

    expect(result.success).toBe(true);
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
    const leafStorm = new Move({
      name: 'leaf-storm', type: 'grass', power: 130, accuracy: 100, pp: 5, category: 'special',
      selfStatChange: [{ stat: 'SPATK', delta: -2 }],
    });

    const result = engine.useMove(user, target, leafStorm);

    expect(result.success).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(user.statStages.SPATK).toBe(-2);
  });

  test('Contrary (あまのじゃく) inverts the direction of self-inflicted stat changes', () => {
    const engine = new BattleEngine();
    const user = makeUser('contrary');
    const target = makeUser('contrary');
    const leafStorm = new Move({
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
      moves: [new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' })],
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

    expect(withReflect.damage).toBeLessThan(withoutReflect.damage!);
    expect(withReflect.damage).toBe(Math.floor(withoutReflect.damage! / 2));
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
    return new Move({ name: 'leech-seed', type: 'grass', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsSeed: true });
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

describe('Target stat-change moves (バークアウト等)', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Arcanine', types: ['fire'], ability: 'intimidate', item: null,
      baseStats: { HP: 90, ATK: 110, DEF: 80, SPATK: 100, SPDEF: 80, SPEED: 95 },
      moves: [new Move({
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
      moves: [new Move({ name: 'morning-sun', type: 'normal', power: 0, accuracy: 100, pp: 5, category: 'status', weatherHeal: true })],
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
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Excadrill', types: ['ground', 'steel'], ability: 'mold-breaker', item: null,
      baseStats: { HP: 110, ATK: 135, DEF: 60, SPATK: 50, SPDEF: 65, SPEED: 88 },
      moves: [new Move({ name: 'rock-blast', type: 'rock', power: 25, accuracy: 90, pp: 10, category: 'physical', multiHit: true })],
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
      const singleHitAttacker = makeAttacker();
      const singleHitDefender = makeDefender();
      singleHitAttacker.moves[0].multiHit = false;
      const singleHit = singleHitEngine.useMove(singleHitAttacker, singleHitDefender, singleHitAttacker.moves[0]);

      const result = engine.useMove(attacker, defender, attacker.moves[0]);

      expect(result.damage).toBe(singleHit.damage! * 5);
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
      expect(result.damage).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('こだわり系アイテムの威力補正', () => {
  function makeAttacker(item: string | null): Pokemon {
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
    const makeMove = () => new Move({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, category: 'physical' });

    const plain = engine.useMove(makeAttacker(null), makeDefender(), makeMove());
    const banded = engine.useMove(makeAttacker('choice-band'), makeDefender(), makeMove());

    expect(banded.damage).toBeGreaterThan(plain.damage!);
  });

  test('こだわりメガネは特殊技の威力を1.5倍にするが物理技には効かない', () => {
    const engine = new BattleEngine();
    const makePhysical = () => new Move({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, category: 'physical' });
    const makeSpecial = () => new Move({ name: 'hyper-voice', type: 'normal', power: 90, accuracy: 100, category: 'special' });

    const plainSpecial = engine.useMove(makeAttacker(null), makeDefender(), makeSpecial());
    const specsSpecial = engine.useMove(makeAttacker('choice-specs'), makeDefender(), makeSpecial());
    expect(specsSpecial.damage).toBeGreaterThan(plainSpecial.damage!);

    const plainPhysical = engine.useMove(makeAttacker(null), makeDefender(), makePhysical());
    const specsPhysical = engine.useMove(makeAttacker('choice-specs'), makeDefender(), makePhysical());
    expect(specsPhysical.damage).toBe(plainPhysical.damage);
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

    const result = engine.useMove(makeAttacker(), makeDefender(), new Move({
      name: 'u-turn', type: 'bug', power: 70, accuracy: 100, category: 'physical', pivot: true,
    }));

    expect(result.success).toBe(true);
    expect(result.pivot).toBe(true);
  });

  test('通常の技はpivot=falseを返す', () => {
    const engine = new BattleEngine();

    const result = engine.useMove(makeAttacker(), makeDefender(), new Move({
      name: 'bullet-punch', type: 'steel', power: 40, accuracy: 100, category: 'physical',
    }));

    expect(result.pivot).toBe(false);
  });

  test('技を外した場合はpivotが立たない', () => {
    const engine = new BattleEngine();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = engine.useMove(makeAttacker(), makeDefender(), new Move({
      name: 'u-turn', type: 'bug', power: 70, accuracy: 50, category: 'physical', pivot: true,
    }));

    expect(result.success).toBe(false);
    expect(result.pivot).toBeUndefined();

    randomSpy.mockRestore();
  });
});

describe('Taunt (ちょうはつ)', () => {
  function makeAttacker(): Pokemon {
    return new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: null,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
        new Move({ name: 'swords-dance', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }),
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
    expect(result.success).toBe(false);
    expect(defender.currentHP).toBe(defender.maxHP); // no damage dealt
  });

  test('taunted pokemon can use status moves', () => {
    const engine = new BattleEngine();
    const attacker = makeAttacker();
    const defender = makeDefender();

    attacker.applyTaunt(3);

    const result = engine.useMove(attacker, defender, attacker.moves[1]); // swords-dance (status)
    expect(result.success).toBe(true);
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
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
    const defender = new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });

    attacker.applyTaunt(3);
    expect(attacker.isTaunted).toBe(true);

    const result = engine.useMove(attacker, defender, attacker.moves[0]);
    expect(result.success).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(attacker.isTaunted).toBe(false); // taunt cured
    expect(attacker.itemUsed).toBe(true); // herb consumed
  });

  test('second attack is blocked after herb is consumed', () => {
    const engine = new BattleEngine();
    const attacker = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'mental-herb', itemUsed: false,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
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
    expect(result.success).toBe(false);
  });

  test('mental herb does not cure taunt if already used', () => {
    const engine = new BattleEngine();
    const attacker = new Pokemon({
      name: 'Garchomp', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'mental-herb', itemUsed: true,
      baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
    const defender = new Pokemon({
      name: 'Blissey', types: ['normal'], ability: 'natural-cure', item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 10, SPATK: 75, SPDEF: 135, SPEED: 55 },
    });

    attacker.applyTaunt(3);

    const result = engine.useMove(attacker, defender, attacker.moves[0]);
    expect(result.success).toBe(false); // still taunted
    expect(attacker.isTaunted).toBe(true);
  });
});
