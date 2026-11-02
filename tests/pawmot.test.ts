import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import type { MoveInput } from '../src/move.js';
import type { Stats, TypeName } from '../src/types.js';
import type { AbilityName } from '../src/ability-names.js';
import { IRON_FIST } from '../src/rules/abilities/meta-abilities.js';

const FIXED_STATS: Stats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const move = (over: MoveInput) => createMove({ pp: 10, maxPP: 10, accuracy: 100, ...over });

// パーモット（M-7 シーズン34位）。実採用は ようき・AS振り・きあいのタスキ。
function makePawmot(over: { hp?: number; ability?: AbilityName } = {}): Pokemon {
  return new Pokemon({
    name: 'パーモット',
    types: ['electric', 'fighting'],
    ability: over.ability ?? 'iron-fist',
    item: 'focus-sash',
    baseStats: { HP: 70, ATK: 115, DEF: 70, SPATK: 70, SPDEF: 60, SPEED: 105 },
    stats: { ...FIXED_STATS, HP: over.hp ?? 100 },
    moves: [],
  });
}

function makeDummy(name = 'Defender', types: TypeName[] = ['normal'], hp = 500): Pokemon {
  return new Pokemon({
    name,
    types,
    ability: 'none',
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    stats: { ...FIXED_STATS, HP: hp, SPEED: 1 },
    moves: [],
  });
}

describe('パーモット（M-7 34位）の実装', () => {
  let engine: BattleEngine;

  beforeEach(() => {
    engine = new BattleEngine();
  });

  describe('でんこうそうげき', () => {
    const doubleShock = () =>
      move({
        name: 'でんこうそうげき',
        type: 'electric',
        category: 'physical',
        power: 120,
        accuracy: 100,
        pp: 8,
        contact: true,
        selfLosesType: 'electric',
      });

    test('攻撃後、自分はでんきタイプでなくなる', () => {
      const attacker = makePawmot();
      const defender = makeDummy();
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      const result = engine.useMove(attacker, defender, doubleShock());

      expect(result.outcome).toBe('damaged');
      expect(attacker.types).toEqual(['fighting']); // でんき・かくとう → かくとう単タイプ
      expect(attacker.lostTypes).toEqual(['electric']);
      expect(defender.currentHP).toBeLessThan(500);
    });

    test('でんきタイプを失った後は失敗する（タイプ相性の計算も変わらない）', () => {
      const attacker = makePawmot();
      const defender = makeDummy();
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      engine.useMove(attacker, defender, doubleShock());
      const hpAfterFirst = defender.currentHP;

      const second = engine.useMove(attacker, defender, doubleShock());

      expect(second).toEqual({ outcome: 'failed', reason: 'missing-type' });
      expect(defender.currentHP).toBe(hpAfterFirst); // 2発目は通らない
    });

    test('場に戻るとでんきタイプが復活する（本編仕様）', () => {
      const attacker = makePawmot();
      const defender = makeDummy();
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      engine.useMove(attacker, defender, doubleShock());
      expect(attacker.types).toEqual(['fighting']);

      engine.switchIn(attacker, [attacker], 0);

      expect(attacker.types).toEqual(['fighting', 'electric']);
      expect(attacker.lostTypes).toEqual([]);
    });

    test('てつのこぶしで威力が1.2倍になる（パンチ技の判定に入っている）', () => {
      const boosted = IRON_FIST.modifyMovePower!({
        pokemon: makePawmot(),
        move: doubleShock(),
        value: 120,
        engine,
      });

      expect(boosted).toBe(144); // floor(120 * 1.2)
    });
  });

  describe('さいきのいのり', () => {
    const revivalBlessing = () =>
      move({ name: 'さいきのいのり', type: 'normal', category: 'status', accuracy: null, pp: 1, revivesFainted: true });

    test('ひんしの味方を最大HPの半分で復活させる', () => {
      const attacker = makePawmot();
      const fainted = makeDummy('Fainted ally', ['water'], 120);
      fainted.currentHP = 0; // ひんし
      const defender = makeDummy();
      engine.registerTeams([attacker, fainted], [defender]);
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      const result = engine.useMove(attacker, defender, revivalBlessing());

      expect(result.outcome).toBe('effect-applied');
      expect(fainted.isFainted).toBe(false);
      expect(fainted.currentHP).toBe(60); // floor(120 / 2)
    });

    test('ひんしの味方がいなければ失敗する', () => {
      const attacker = makePawmot();
      const ally = makeDummy('Ally');
      const defender = makeDummy();
      engine.registerTeams([attacker, ally], [defender]);
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      const result = engine.useMove(attacker, defender, revivalBlessing());

      expect(result).toEqual({ outcome: 'no-effect', reason: 'no-applicable-effect', pivot: false });
    });

    test('復活した味方は状態異常と能力変化が初期化される', () => {
      const attacker = makePawmot();
      const fainted = makeDummy('Fainted ally', ['water'], 200);
      fainted.currentHP = 0;
      fainted.applyStatus('poison');
      fainted.modifyStatStage('ATK', 2);
      const defender = makeDummy();
      engine.registerTeams([attacker, fainted], [defender]);
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);

      engine.useMove(attacker, defender, revivalBlessing());

      expect(fainted.statusState.kind).toBe('none');
      expect(fainted.statStages.ATK).toBe(0);
      expect(fainted.currentHP).toBe(100); // floor(200 / 2)
    });
  });
});
