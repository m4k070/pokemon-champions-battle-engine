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

  test('バトルスイッチ: 攻撃技でブレード、キングシールドでシールドに戻る', () => {
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

    // ターン終了ではシールドに戻らない（戻るのはキングシールド使用時）。
    engine.events.emit('end-turn', { team: [aegislash] });
    expect(aegislash.form).toBe('blade');

    engine.useMove(aegislash, defender, move({ name: 'King Shield', type: 'steel', power: 0, restoresShieldForm: true }));
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

  test('げきりゅう: HP1/3以下でみず技の威力が1.5倍になる', () => {
    const torrent = makePokemon('Torrent', 'torrent', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, torrent);
    const { TORRENT } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');

    torrent.currentHP = 33; // 1/3以下
    const boosted = TORRENT.modifyMovePower!({ pokemon: torrent, move: move({ name: 'Water Gun', type: 'water', power: 40 }), value: 40, engine });
    expect(boosted).toBe(60);

    const other = TORRENT.modifyMovePower!({ pokemon: torrent, move: move({ name: 'Ember', type: 'fire', power: 40 }), value: 40, engine });
    expect(other).toBe(40); // 他タイプはそのまま

    torrent.currentHP = 50; // 1/3超え
    const normal = TORRENT.modifyMovePower!({ pokemon: torrent, move: move({ name: 'Water Gun', type: 'water', power: 40 }), value: 40, engine });
    expect(normal).toBe(40); // ピンチでなければ発動しない
  });

  test('しろいハーブ: 能力低下を1回防ぐ', () => {
    const whiteHerb = makePokemon('WhiteHerb', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    whiteHerb.item = 'white-herb';
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, whiteHerb);

    engine.useMove(
      attacker,
      whiteHerb,
      move({ name: 'Lunge', type: 'bug', power: 80, targetStatChange: [{ stat: 'ATK', delta: -1, chance: 100 }] }),
    );
    expect(whiteHerb.statStages.ATK).toBe(0); // 防がれる
    expect(whiteHerb.itemUsed).toBe(true); // 消費される

    // 2回目の低下は防げない
    engine.useMove(
      attacker,
      whiteHerb,
      move({ name: 'Lunge', type: 'bug', power: 80, targetStatChange: [{ stat: 'ATK', delta: -1, chance: 100 }] }),
    );
    expect(whiteHerb.statStages.ATK).toBe(-1);
  });

  test('くろいてっきゅう: 素早さが半減する', () => {
    const slow = makePokemon('Slow', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    slow.item = 'iron-ball';
    engine.setActivePokemon(0, slow);

    expect(engine.calculateSpeed(slow)).toBe(50);
  });

  test('スピーダー: ターン終了時に素早さが1段階上がる（消耗品）', () => {
    const speedy = makePokemon('Speedy', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    speedy.item = 'x-speed';
    engine.setActivePokemon(0, speedy);

    engine.events.emit('end-turn', { team: [speedy] });
    expect(speedy.statStages.SPEED).toBe(1);
    expect(speedy.itemUsed).toBe(true);

    // 2ターン目: 消耗済みなので上がらない
    engine.events.emit('end-turn', { team: [speedy] });
    expect(speedy.statStages.SPEED).toBe(1);
  });

  test('マジシャン: 攻撃を当てた相手の持ち物を奪う', () => {
    const magician = makePokemon('Magician', 'magician', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    magician.item = null;
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    defender.item = 'leftovers';
    engine.setActivePokemon(0, magician);
    engine.setActivePokemon(1, defender);

    engine.useMove(magician, defender, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(magician.item).toBe('leftovers'); // 奪った
    expect(defender.item).toBeNull(); // 相手は失う

    // 持ち物を持っている相手からは奪えない
    const defender2 = makePokemon('Defender2', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    defender2.item = 'life-orb';
    engine.setActivePokemon(1, defender2);
    engine.useMove(magician, defender2, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(magician.item).toBe('leftovers'); // すでに持っているので奪わない
    expect(defender2.item).toBe('life-orb');
  });

  test('ちょうはつ: 変化技以外を使用できない', () => {
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const taunted = makePokemon('Taunted', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    taunted.applyTaunt(3);
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, taunted);

    // 攻撃技は使えない
    const result = engine.useMove(taunted, attacker, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(result.success).toBe(false);

    // 変化技は使える（stats変化のみの技）
    const statResult = engine.useMove(taunted, attacker, move({ name: 'Swords Dance', type: 'normal', power: 0, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] }));
    expect(statResult.success).toBe(true);
  });

  test('メンタルハーブ: ちょうはつを1回だけ解除する', () => {
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const holder = makePokemon('Holder', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    holder.item = 'mental-herb';
    holder.applyTaunt(3);
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, holder);

    // 1回目: メンタルハーブで挑発を解除して技を通す
    const result = engine.useMove(holder, attacker, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(result.success).toBe(true);
    expect(holder.isTaunted).toBe(false);
    expect(holder.itemUsed).toBe(true);

    // 再び挑発された場合、メンタルハーブはもう使えない
    holder.applyTaunt(2);
    const result2 = engine.useMove(holder, attacker, move({ name: 'Tackle', type: 'normal', power: 40 }));
    expect(result2.success).toBe(false); // メンタルハーブは消費済みなので挑発が残る
  });

  test('メンタルハーブ: ターン終了時にちょうはつを解除する', () => {
    const holder = makePokemon('Holder', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    holder.item = 'mental-herb';
    holder.applyTaunt(3);
    engine.setActivePokemon(0, holder);

    // ターン終了時にメンタルハーブが発動
    engine.events.emit('end-turn', { team: [holder] });
    expect(holder.isTaunted).toBe(false);
    expect(holder.itemUsed).toBe(true);
  });

  test('ちょうはつ: 交代で解除される', () => {
    const pokemon = makePokemon('Pokemon', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    pokemon.applyTaunt(3);
    pokemon.resetTaunt();
    expect(pokemon.isTaunted).toBe(false);
  });

  test('とびだすハバネロ: 攻撃技でダメージを受けたとき、攻撃者をやけどにする', () => {
    const { SPICY_SPRAY } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');
    const defender = makePokemon('Scovillain', 'spicy-spray', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attacker = makePokemon('Attacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    // 物理技で攻撃 → やける
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, defender);
    engine.applyDamage(defender, 10, attacker, move({ name: 'Tackle', type: 'normal', power: 40, category: 'physical' }));
    expect(attacker.status).toBe('burn');

    // 特殊技でも発動する（フレレイムボディと違い）
    const attacker2 = makePokemon('Attacker2', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker2);
    engine.applyDamage(defender, 10, attacker2, move({ name: 'Thunderbolt', type: 'electric', power: 90, category: 'special' }));
    expect(attacker2.status).toBe('burn');

    // ほのおタイプは無効
    const fireAttacker = makePokemon('FireAttacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    fireAttacker.types = ['fire'];
    engine.setActivePokemon(0, fireAttacker);
    engine.applyDamage(defender, 10, fireAttacker, move({ name: 'Ember', type: 'fire', power: 40, category: 'special' }));
    expect(fireAttacker.status).toBeNull();

    // すでに状態異常の相手には発動しない
    const statusAttacker = makePokemon('StatusAttacker', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    statusAttacker.status = 'poison';
    engine.setActivePokemon(0, statusAttacker);
    engine.applyDamage(defender, 10, statusAttacker, move({ name: 'Tackle', type: 'normal', power: 40, category: 'physical' }));
    expect(statusAttacker.status).toBe('poison'); // 変わらない
  });

  test('エレキメイカー: 入場時にエレキフィールドを展開し、でん技の威力が1.3倍になる', () => {
    const { ELECTRIC_SURGE } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');
    const attacker = makePokemon('Raichu', 'electric-surge', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    // エレキフィールドなしでは補正なし
    const electricNormal = ELECTRIC_SURGE.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Thunderbolt', type: 'electric', power: 90 }), value: 90, engine });
    expect(electricNormal).toBe(90);

    // エレキフィールドありでは1.3倍
    engine.field.terrain = 'electric-terrain';
    const electricBoosted = ELECTRIC_SURGE.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Thunderbolt', type: 'electric', power: 90 }), value: 90, engine });
    expect(electricBoosted).toBe(117);

    const otherType = ELECTRIC_SURGE.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Tackle', type: 'normal', power: 40 }), value: 40, engine });
    expect(otherType).toBe(40);
  });

  test('つめかえなし: 接触技の威力が1.3倍になる', () => {
    const { TOUGH_CLAWS } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');
    const attacker = makePokemon('Charizard', 'tough-claws', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    const contactBoosted = TOUGH_CLAWS.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Dragon Claw', type: 'dragon', power: 80, contact: true }), value: 80, engine });
    expect(contactBoosted).toBe(104);

    const nonContact = TOUGH_CLAWS.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Earthquake', type: 'ground', power: 100, contact: false }), value: 100, engine });
    expect(nonContact).toBe(100);
  });

  test('ひでり: 入場時に天候をはれにする', () => {
    const drought = makePokemon('Drought', 'drought', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, drought);
    engine.setActivePokemon(1, defender);

    engine.switchIn(drought, [drought, defender], 0);
    expect(engine.weather).toBe('sun');
    expect(engine.weatherTurnsLeft).toBe(5);
  });

  test('すなふぶき: すなあらし中いわ技の威力が1.3倍になる', () => {
    const { SAND_FORCE } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');
    const attacker = makePokemon('Garchomp', 'sand-force', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    engine.weather = 'sand';
    const rockBoosted = SAND_FORCE.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Stone Edge', type: 'rock', power: 100 }), value: 100, engine });
    expect(rockBoosted).toBe(130);

    engine.weather = null;
    const rockNormal = SAND_FORCE.modifyMovePower!({ pokemon: attacker, move: move({ name: 'Stone Edge', type: 'rock', power: 100 }), value: 100, engine });
    expect(rockNormal).toBe(100);
  });
});
