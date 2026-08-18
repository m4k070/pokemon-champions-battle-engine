import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';
import type { BaseStats, MoveData, Stats } from '../src/types.js';

const FIXED_STATS: Stats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

function makePokemon(name: string, ability: string, baseStats: BaseStats, moves: MoveData[] = []): Pokemon {
  // テストでは実数値を固定する（Lv.50計算の個体値補正に依存しないため）。
  return new Pokemon({ name, types: ['normal'], ability, item: null, baseStats, stats: { ...FIXED_STATS }, moves });
}

const move = (over: Partial<MoveData> & { name: string; type: MoveData['type']; power: number }): MoveData =>
  new Move({ pp: 10, maxPP: 10, accuracy: 100, category: 'physical', ...over }) as unknown as MoveData;

describe('上位構築向け特性（meta-abilities）', () => {
  let engine: BattleEngine;

  beforeEach(() => {
    engine = new BattleEngine();
  });

  test('てんねん: 相手の攻撃能力上昇を無視する', () => {
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const unaware = makePokemon('Unaware', 'unaware', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, unaware);

    attacker.modifyStatStage('ATK', 4); // 攻撃+4
    const attack = engine.calculateAttack(attacker, { category: 'physical' });
    expect(attack).toBe(100); // 無視されるので素の攻撃値
  });

  test('テクニシャン: 威力60以下の技が1.5倍になる', () => {
    const attacker = makePokemon('Technician', 'technician', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(1, defender);

    // modifyMovePower を直接検証（バトル全体だと乱数が入るため）
    const { TECHNICIAN } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');
    const boosted = TECHNICIAN.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Bullet Punch', type: 'steel', power: 40 }), value: 40, engine });
    expect(boosted).toBe(60);
    const unboosted = TECHNICIAN.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Iron Head', type: 'steel', power: 80 }), value: 80, engine });
    expect(unboosted).toBe(80);
  });

  test('ちからもち: 攻撃が2倍になる', () => {
    const attacker = makePokemon('HugePower', 'huge-power', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(1, defender);

    const attack = engine.calculateAttack(attacker, { category: 'physical' });
    expect(attack).toBe(200);
  });

  test('がんじょう: HP満タン時の一撃をHP1で耐える', () => {
    const sturdy = makePokemon('Sturdy', 'sturdy', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, sturdy);

    engine.applyDamage(sturdy, 999, attacker, move({ name: 'Hyper Beam', type: 'normal', power: 150 }));
    expect(sturdy.currentHP).toBe(1);
  });

  test('かそく: ターン終了時に素早さが上がる', () => {
    const speedy = makePokemon('Speedy', 'speed-boost', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, speedy);
    engine.events.emit('end-turn', { team: [speedy] });
    expect(speedy.statStages.SPEED).toBe(1);
  });

  test('ふゆう: 地面技を無効化する', () => {
    const levitate = makePokemon('Levitate', 'levitate', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, levitate);

    const result = engine.useMove(attacker, levitate, move({ name: 'Earthquake', type: 'ground', power: 100 }));
    expect(result.success).toBe(false);
    expect(levitate.currentHP).toBe(100);
  });

  test('じきゅうりょく: 攻撃を受けると防御が上がる', () => {
    const stamina = makePokemon('Stamina', 'stamina', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, stamina);

    engine.applyDamage(stamina, 10, attacker, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(stamina.statStages.DEF).toBe(1);
  });

  test('あついしぼう: ほのお技のダメージが半減する', () => {
    const thickFat = makePokemon('ThickFat', 'thick-fat', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, thickFat);

    engine.applyDamage(thickFat, 100, attacker, move({ name: 'Flamethrower', type: 'fire', power: 90 }));
    expect(thickFat.currentHP).toBe(50);
  });

  test('バトルスイッチ: 攻撃技でブレード、ターン終了でシールドに戻る', () => {
    const formStats = {
      shield: { HP: 60, ATK: 50, DEF: 150, SPATK: 50, SPDEF: 150, SPEED: 60 },
      blade: { HP: 60, ATK: 150, DEF: 50, SPATK: 150, SPDEF: 50, SPEED: 60 },
    };
    const aegislash = new Pokemon({
      name: 'Aegislash',
      types: ['steel', 'ghost'],
      ability: 'battle-switch',
      item: null,
      baseStats: formStats.shield,
      stats: { ...FIXED_STATS },
      moves: [move({ name: 'Iron Head', type: 'steel', power: 80 })],
      form: 'shield',
      formStats,
    });
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, aegislash);
    engine.setActivePokemon(1, defender);

    engine.useMove(aegislash, defender, move({ name: 'Iron Head', type: 'steel', power: 80 }));
    expect(aegislash.form).toBe('blade');

    engine.events.emit('end-turn', { team: [aegislash] });
    expect(aegislash.form).toBe('shield');
  });

  test('ミラーアーマー: 相手の能力低下を反射する', () => {
    const mirrorArmor = makePokemon('MirrorArmor', 'mirror-armor', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, mirrorArmor);

    engine.useMove(
      attacker,
      mirrorArmor,
      move({ name: 'Lunge', type: 'bug', power: 80, targetStatChange: [{ stat: 'ATK', delta: -1, chance: 100 }] }),
    );
    expect(mirrorArmor.statStages.ATK).toBe(0); // 低下は反射されるので自分は下がらない
    expect(attacker.statStages.ATK).toBe(-1); // 攻撃者側に反射される
  });
});
