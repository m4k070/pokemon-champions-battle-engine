import { BattleEngine } from '../src/battle-engine.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';
import type { BaseStats, MoveData, Stats, TypeName } from '../src/types.js';

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

  test('へんげんじざい: 技を使うとその技のタイプに変わる（単一タイプになる）', () => {
    const greninja = new Pokemon({
      name: 'Greninja',
      types: ['water', 'dark'],
      ability: 'protean',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      stats: { ...FIXED_STATS },
      moves: [move({ name: 'Ice Beam', type: 'ice', power: 90 })],
    });
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, greninja);
    engine.setActivePokemon(1, defender);

    expect(greninja.types).toEqual(['water', 'dark']);

    engine.useMove(greninja, defender, move({ name: 'Ice Beam', type: 'ice', power: 90 }));
    expect(greninja.types).toEqual(['ice']); // 技タイプ（こおり）の単一タイプになる
  });

  test('へんげんじざい: 既に技タイプと同じなら変化しない', () => {
    const greninja = new Pokemon({
      name: 'Greninja',
      types: ['water'],
      ability: 'protean',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      stats: { ...FIXED_STATS },
      moves: [move({ name: 'Surf', type: 'water', power: 90 })],
    });
    const defender = makePokemon('Defender', 'normal-ability', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, greninja);
    engine.setActivePokemon(1, defender);

    engine.useMove(greninja, defender, move({ name: 'Surf', type: 'water', power: 90 }));
    expect(greninja.types).toEqual(['water']); // 変化なし
  });

  test('すいすい: 雨のとき素早さが2倍になる', () => {
    const swampert = new Pokemon({
      name: 'Swampert',
      types: ['water', 'ground'],
      ability: 'swift-swim',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 70 },
      stats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 70 },
    });
    engine.setActivePokemon(0, swampert);

    expect(engine.calculateSpeed(swampert)).toBe(70); // 晴れ: そのまま

    engine.weather = 'rain';
    expect(engine.calculateSpeed(swampert)).toBe(140); // 雨: 2倍

    engine.weather = null;
    expect(engine.calculateSpeed(swampert)).toBe(70); // 雨が止むと戻る
  });

  test('おやこあい: 攻撃技が2回ヒットし、2回目は威力1/4', () => {
    const makeKangaskhan = (ability: string) => new Pokemon({
      name: 'Kangaskhan',
      types: ['normal'],
      ability,
      item: null,
      baseStats: { HP: 105, ATK: 100, DEF: 100, SPATK: 60, SPDEF: 100, SPEED: 100 },
      stats: { HP: 200, ATK: 100, DEF: 100, SPATK: 60, SPDEF: 100, SPEED: 100 },
      moves: [move({ name: 'Return', type: 'normal', power: 80 })],
    });
    const makeDef = () => makePokemon('Defender', 'normal-ability', { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 });

    // 親子愛なしの単発ダメージを基準にする
    const normal = makeKangaskhan('none');
    const def1 = makeDef();
    engine.setActivePokemon(0, normal);
    engine.setActivePokemon(1, def1);
    const r1 = engine.useMove(normal, def1, move({ name: 'Return', type: 'normal', power: 80 }));
    const singleDamage = r1.damage ?? 0;
    expect(singleDamage).toBeGreaterThan(0);

    // 親子愛あり: 1回目（単発相当）+ 2回目（威力1/4）
    const parental = makeKangaskhan('parental-bond');
    const def2 = makeDef();
    engine.setActivePokemon(0, parental);
    engine.setActivePokemon(1, def2);
    const r2 = engine.useMove(parental, def2, move({ name: 'Return', type: 'normal', power: 80 }));
    const parentalDamage = r2.damage ?? 0;

    expect(parentalDamage).toBeGreaterThan(singleDamage);            // 2回攻撃で単発より大きい
    expect(parentalDamage).toBeLessThan(singleDamage * 1.5);         // 2回目は1/4威力（合計≈1.25倍）
    expect(engine.getLog()).toContain('おやこあいで2回攻撃した');
  });

  test('きもったま: いかくを無効化する', () => {
    const scrappy = makePokemon('Scrappy', 'scrappy', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const intimidator = makePokemon('Intimidator', 'intimidate', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, intimidator);
    engine.setActivePokemon(1, scrappy);

    const atkBefore = scrappy.stats.ATK;
    engine.events.emit('switch-in', { pokemon: intimidator, engine });

    expect(scrappy.stats.ATK).toBe(atkBefore); // 攻撃は下がらない
    expect(engine.getLog()).toContain('きもったま');
  });

  test('マルチスケイル: HP満タン時に受けるダメージが半減する', () => {
    const makeDef = (ability: string) => makePokemon('Def', ability, { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 });
    const attacker = makePokemon('Attacker', 'none', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    // 基準: マルチスケイルなしの実際のダメージ（currentHPの変化で測る）
    const normal = makeDef('none');
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, normal);
    const hp1 = normal.currentHP;
    engine.useMove(attacker, normal, move({ name: 'Tackle', type: 'normal', power: 80 }));
    const normalDamage = hp1 - normal.currentHP;
    expect(normalDamage).toBeGreaterThan(0);

    // マルチスケイル（満HP）: 受けるダメージが半減する
    const ms = makeDef('multiscale');
    engine.setActivePokemon(1, ms);
    const hp2 = ms.currentHP;
    engine.useMove(attacker, ms, move({ name: 'Tackle', type: 'normal', power: 80 }));
    const fullHPDamage = hp2 - ms.currentHP;
    expect(fullHPDamage).toBeLessThanOrEqual(Math.ceil(normalDamage / 2)); // 満HP時は半減

    // HP減後（満HPでない）: 半減しない
    const hp3 = ms.currentHP;
    engine.useMove(attacker, ms, move({ name: 'Tackle', type: 'normal', power: 80 }));
    const damagedDamage = hp3 - ms.currentHP;
    expect(damagedDamage).toBeGreaterThan(fullHPDamage);
  });

  test('適応力: タイプ一致技の威力が2倍になる（通常STAB 1.5倍より高い）', () => {
    const makeLucario = (ability: string) => new Pokemon({
      name: 'Lucario',
      types: ['fighting', 'steel'],
      ability,
      item: null,
      baseStats: { HP: 70, ATK: 110, DEF: 70, SPATK: 115, SPDEF: 70, SPEED: 90 },
      stats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [move({ name: 'Close Combat', type: 'fighting', power: 120 })],
    });
    const makeDef = () => makePokemon('Def', 'none', { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 });

    // 通常STAB（1.5倍）
    const normal = makeLucario('none');
    const def1 = makeDef();
    engine.setActivePokemon(0, normal);
    engine.setActivePokemon(1, def1);
    const r1 = engine.useMove(normal, def1, move({ name: 'Close Combat', type: 'fighting', power: 120 }));
    const normalDamage = r1.damage ?? 0;
    expect(normalDamage).toBeGreaterThan(0);

    // 適応力（2倍）
    const adapt = makeLucario('adaptability');
    const def2 = makeDef();
    engine.setActivePokemon(0, adapt);
    engine.setActivePokemon(1, def2);
    const r2 = engine.useMove(adapt, def2, move({ name: 'Close Combat', type: 'fighting', power: 120 }));
    const adaptDamage = r2.damage ?? 0;

    // 2倍 / 1.5倍 = 1.333倍
    expect(adaptDamage).toBeGreaterThan(normalDamage);
    expect(adaptDamage).toBeLessThanOrEqual(Math.ceil(normalDamage * 1.34));
  });

  test('スカイスキン: ノーマル技がひこう技として計算される', () => {
    const mence = new Pokemon({
      name: 'Salamence',
      types: ['dragon', 'flying'],
      ability: 'aerilate',
      item: null,
      baseStats: { HP: 95, ATK: 135, DEF: 80, SPATK: 110, SPDEF: 80, SPEED: 100 },
      stats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [move({ name: 'Return', type: 'normal', power: 100 })],
    });
    // くさタイプ: ひこう2倍（ノーマルは等倍）
    const defender = new Pokemon({
      name: 'Def',
      types: ['grass'],
      ability: 'none',
      item: null,
      baseStats: { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 },
      stats: { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 },
    });
    engine.setActivePokemon(0, mence);
    engine.setActivePokemon(1, defender);

    const r = engine.useMove(mence, defender, move({ name: 'Return', type: 'normal', power: 100 }));
    expect(r.effectiveness).toBe(2); // ひこう技として抜群
  });

  test('フェアリースキン: ノーマル技がフェアリー技として計算される', () => {
    const gardevoir = new Pokemon({
      name: 'Gardevoir',
      types: ['psychic', 'fairy'],
      ability: 'pixilate',
      item: null,
      baseStats: { HP: 68, ATK: 65, DEF: 65, SPATK: 125, SPDEF: 115, SPEED: 80 },
      stats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [move({ name: 'Hyper Voice', type: 'normal', power: 90 })],
    });
    // かくとうタイプ: フェアリー2倍（ノーマルは等倍）
    const defender = new Pokemon({
      name: 'Def',
      types: ['fighting'],
      ability: 'none',
      item: null,
      baseStats: { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 },
      stats: { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 },
    });
    engine.setActivePokemon(0, gardevoir);
    engine.setActivePokemon(1, defender);

    const r = engine.useMove(gardevoir, defender, move({ name: 'Hyper Voice', type: 'normal', power: 90 }));
    expect(r.effectiveness).toBe(2); // フェアリー技として抜群
  });

  test('かたやぶり: 相手の特性（マルチスケイル）を無視する', () => {
    const makeDef = (ability: string) => makePokemon('Def', ability, { HP: 200, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 10 });
    const attacker = makePokemon('Attacker', 'mold-breaker', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    const attackerNoMB = makePokemon('Attacker2', 'none', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });

    // 基準: かたやぶりなし（マルチスケイル半減が効く）
    const ms1 = makeDef('multiscale');
    engine.setActivePokemon(0, attackerNoMB);
    engine.setActivePokemon(1, ms1);
    const hp1 = ms1.currentHP;
    engine.useMove(attackerNoMB, ms1, move({ name: 'Tackle', type: 'normal', power: 80 }));
    const halvedDamage = hp1 - ms1.currentHP;

    // かたやぶり: マルチスケイルを無視（半減されない）
    const ms2 = makeDef('multiscale');
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, ms2);
    const hp2 = ms2.currentHP;
    engine.useMove(attacker, ms2, move({ name: 'Tackle', type: 'normal', power: 80 }));
    const ignoredDamage = hp2 - ms2.currentHP;

    expect(ignoredDamage).toBeGreaterThan(halvedDamage); // かたやぶりで半減が無視される
  });

  test('マジックミラー: 変化技を跳ね返す', () => {
    const bouncer = new Pokemon({
      name: 'Sableye',
      types: ['dark', 'ghost'],
      ability: 'magic-bounce',
      item: null,
      baseStats: { HP: 50, ATK: 75, DEF: 75, SPATK: 65, SPDEF: 65, SPEED: 50 },
      stats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    });
    const attacker = makePokemon('Attacker', 'none', { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 });
    engine.setActivePokemon(0, attacker);
    engine.setActivePokemon(1, bouncer);

    engine.useMove(attacker, bouncer, move({ name: 'Toxic', type: 'poison', power: 0, category: 'status', status: 'poison' }));

    expect(attacker.status).toBe('poison'); // 跳ね返されて攻撃者が毒になる
    expect(bouncer.status).toBeNull(); // 防御側は無傷
    expect(engine.getLog()).toContain('マジックミラー');
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

  test('きもったま: Normal/Fighting技がゴーストに有効になる', () => {
    const { SCRAPPY } = require('../src/rules/abilities/meta-abilities.js') as typeof import('../src/rules/abilities/meta-abilities.js');

    // ゴーストタイプ相手
    const ghostTypes: TypeName[] = ['ghost'];
    // 通常: Normal技 → Ghost = 0 (無効)
    expect(engine.getTypeEffectiveness('normal', ghostTypes)).toBe(0);
    // 通常: Fighting技 → Ghost = 0 (無効)
    expect(engine.getTypeEffectiveness('fighting', ghostTypes)).toBe(0);

    // きもったま持ちが攻撃する場合
    const result1 = SCRAPPY.modifyTypeEffectiveness!({
      attackType: 'normal', defenderTypes: ghostTypes, effectiveness: 0, engine,
    });
    expect(result1).toBe(1.0); // 有効になる

    const result2 = SCRAPPY.modifyTypeEffectiveness!({
      attackType: 'fighting', defenderTypes: ghostTypes, effectiveness: 0, engine,
    });
    expect(result2).toBe(1.0); // 有効になる

    // 他のタイプは変わらない
    const result3 = SCRAPPY.modifyTypeEffectiveness!({
      attackType: 'fire', defenderTypes: ghostTypes, effectiveness: 1.0, engine,
    });
    expect(result3).toBe(1.0); // 変わらない

    // ゴースト以外の相手は変わらない
    const normalTypes: TypeName[] = ['normal'];
    const result4 = SCRAPPY.modifyTypeEffectiveness!({
      attackType: 'normal', defenderTypes: normalTypes, effectiveness: 1.0, engine,
    });
    expect(result4).toBe(1.0); // 等倍はそのまま

    // 2倍効果が0になるケース（Ghost/Dark → Normal技）
    const ghostDarkTypes: TypeName[] = ['ghost', 'dark'];
    // Ghost で 0、Dark で 1 → 合計 0
    expect(engine.getTypeEffectiveness('normal', ghostDarkTypes)).toBe(0);
    const result5 = SCRAPPY.modifyTypeEffectiveness!({
      attackType: 'normal', defenderTypes: ghostDarkTypes, effectiveness: 0, engine,
    });
    expect(result5).toBe(1.0); // きもったまで有効化
  });
});
