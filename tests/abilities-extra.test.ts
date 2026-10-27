import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';

// 2026-10-24 追加: 名前だけだった特性の実装と、観測による特性の公開。
// 状態異常・能力低下・素早さの判定は battle-engine に集約しているので、
// ここでは「エンジン越しに効いているか」を固定する。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  ability?: Pokemon['ability'];
  types?: Pokemon['types'];
  item?: Pokemon['item'];
  speed?: number;
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: options.item ?? null,
    baseStats: options.speed === undefined ? stats : { ...stats, SPEED: options.speed },
    moves: [],
  });

const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' });
const thunderbolt = () => createMove({ name: '10まんボルト', type: 'electric', power: 80, accuracy: 100, pp: 10, category: 'special' });
const thunderWave = () =>
  createMove({ name: 'でんじは', type: 'electric', power: 0, accuracy: 100, pp: 10, category: 'status', status: 'paralysis' });
const hypnosis = () =>
  createMove({ name: 'さいみんじゅつ', type: 'psychic', power: 0, accuracy: 100, pp: 10, category: 'status', status: 'sleep' });

function makeEngine(activeA: Pokemon, activeB: Pokemon, teammatesA: Pokemon[] = [], teammatesB: Pokemon[] = []): BattleEngine {
  const engine = new BattleEngine({ rng: new SeededRandom(11) });
  engine.setActivePokemon(0, activeA);
  engine.setActivePokemon(1, activeB);
  engine.registerTeams([activeA, ...teammatesA], [activeB, ...teammatesB]);
  return engine;
}

describe('特性による状態異常の無効化', () => {
  test('じゅなんはまひを防ぎ、特性が公開される', () => {
    const limber = mon('じゅなん持ち', { ability: 'limber' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, limber);

    const result = engine.useMove(attacker, limber, thunderWave());

    expect(result.outcome).toBe('no-effect');
    expect(limber.status).toBeNull();
    expect(limber.abilityRevealed).toBe(true);
  });

  test('ふみんは眠りを防ぐ（定義だけだった従来の穴）', () => {
    const insomnia = mon('ふみん持ち', { ability: 'insomnia' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, insomnia);

    const result = engine.useMove(attacker, insomnia, hypnosis());

    expect(result.outcome).toBe('no-effect');
    expect(insomnia.status).toBeNull();
  });

  test('フラワーヴェールはくさタイプの味方を状態異常から守る', () => {
    const veil = mon('フラワーヴェール持ち', { ability: 'flower-veil' });
    const grassAlly = mon('くさの味方', { types: ['grass'] });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, grassAlly, [], [veil]);

    expect(engine.flowerVeilProtects(grassAlly)).toBe(true);
    const result = engine.useMove(attacker, grassAlly, thunderWave());
    expect(result.outcome).toBe('no-effect');
    expect(grassAlly.status).toBeNull();
  });

  test('くさタイプでなければフラワーヴェールの守りは及ばない', () => {
    const veil = mon('フラワーヴェール持ち', { ability: 'flower-veil' });
    const normal = mon('ノーマル', { types: ['normal'] });
    const engine = makeEngine(normal, veil, [veil], []);
    expect(engine.flowerVeilProtects(normal)).toBe(false);
  });
});

describe('プレッシャー・ちくでん・どくげしょう', () => {
  test('プレッシャーは相手のPP消費を2倍にする', () => {
    const pressure = mon('プレッシャー持ち', { ability: 'pressure' });
    const attacker = mon('攻撃側');
    const move = tackle();
    attacker.moves = [move];
    const engine = makeEngine(attacker, pressure);

    engine.useMove(attacker, pressure, move);

    expect(move.pp).toBe(8); // 10 - 2
    expect(pressure.abilityRevealed).toBe(true);
  });

  test('プレッシャーがなければPP消費は1', () => {
    const target = mon('ふつう');
    const attacker = mon('攻撃側');
    const move = tackle();
    attacker.moves = [move];
    const engine = makeEngine(attacker, target);

    engine.useMove(attacker, target, move);

    expect(move.pp).toBe(9);
  });

  test('ちくでんはでんき技を無効化し特攻を上げる', () => {
    const absorb = mon('ちくでん持ち', { ability: 'volt-absorb' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, absorb);

    const result = engine.useMove(attacker, absorb, thunderbolt());

    expect(result.outcome).toBe('failed');
    expect(absorb.currentHP).toBe(absorb.maxHP);
    expect(absorb.statStages.SPATK).toBe(1);
    expect(absorb.abilityRevealed).toBe(true);
  });

  test('どくげしょうは物理技を受けると相手の場にどくびしを置く', () => {
    const debris = mon('どくげしょう持ち', { ability: 'toxic-debris' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, debris);

    engine.applyDamage(debris, 30, attacker, tackle());

    expect(engine.field.toxicSpikes.playerA).toBe(1); // 攻撃側（side 0）の場
    expect(debris.abilityRevealed).toBe(true);
  });

  test('どくげしょうは特殊技では発動しない', () => {
    const debris = mon('どくげしょう持ち', { ability: 'toxic-debris' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, debris);

    engine.applyDamage(debris, 30, attacker, thunderbolt());

    expect(engine.field.toxicSpikes.playerA).toBe(0);
  });
});

describe('素早さと回復', () => {
  test('ようりょくそは晴れで素早さ2倍', () => {
    const fast = mon('ようりょくそ持ち', { ability: 'chlorophyll' });
    const plain = mon('ふつう');
    const engine = makeEngine(fast, plain);

    const base = engine.calculateSpeed(fast);
    engine.weather = 'sun';
    expect(engine.calculateSpeed(fast)).toBe(base * 2);
    expect(engine.calculateSpeed(plain)).toBe(base);
  });

  test('かるわざは持ち物を失うと素早さ2倍', () => {
    const unburden = mon('かるわざ持ち', { ability: 'unburden' });
    const plain = mon('ふつう');
    const engine = makeEngine(unburden, plain);

    const base = engine.calculateSpeed(unburden);
    unburden.itemUsed = true;
    expect(engine.calculateSpeed(unburden)).toBe(base * 2);
  });

  test('あめうけざらは雨のターン終了時に回復する', () => {
    const dish = mon('あめうけざら持ち', { ability: 'rain-dish' });
    const other = mon('相手');
    const engine = makeEngine(dish, other);
    engine.weather = 'rain';
    dish.takeDamage(dish.maxHP - 40, engine);

    const before = dish.currentHP;
    engine.endTurn([dish], [other]);

    expect(dish.currentHP).toBeGreaterThan(before);
    expect(dish.abilityRevealed).toBe(true);
  });
});

describe('クリアボディと特性の公開', () => {
  test('クリアボディはいかくの能力低下を防ぐ', () => {
    const clearBody = mon('クリアボディ持ち', { ability: 'clear-body' });
    const intimidator = mon('いかく持ち', { ability: 'intimidate' });
    const engine = makeEngine(clearBody, intimidator);

    engine.switchIn(intimidator, [intimidator], 0);

    expect(clearBody.statStages.ATK).toBe(0);
    expect(intimidator.abilityRevealed).toBe(true);
  });

  test('不完全情報モード: 未観測の特性は伏せられ、観測後に公開される', async () => {
    const opponent = mon('相手', { ability: 'clear-body', item: 'leftovers' });
    const mine = mon('自分');
    const session = await BattleSession.start([mine], [opponent], {
      information: 'partial',
      rng: new SeededRandom(3),
    });

    const before = session.getContext(0);
    expect(before.opponent.ability).toBe('none');
    expect(before.opponent.item).toBeNull();

    session.engine.observeAbility(opponent);
    const after = session.getContext(0);
    expect(after.opponent.ability).toBe('clear-body');
    expect(after.opponent.item).toBeNull(); // 持ち物は特性とは別管理
  });

  test('おみとおしは出た瞬間に相手の持ち物を判明させる', async () => {
    const frisk = mon('おみとおし持ち', { ability: 'frisk' });
    const opponent = mon('相手', { item: 'leftovers' });
    const session = await BattleSession.start([frisk], [opponent], {
      information: 'partial',
      rng: new SeededRandom(5),
    });

    expect(session.getContext(0).opponent.item).toBe('leftovers');
    expect(session.getContext(1).opponent.item).toBeNull(); // 逆向きは不明のまま
  });
});

describe('もらいび', () => {
  const flamethrower = () =>
    createMove({ name: 'かえんほうしゃ', type: 'fire', power: 90, accuracy: 100, pp: 10, category: 'special' });
  const willOWisp = () =>
    createMove({ name: 'おにび', type: 'fire', power: 0, accuracy: 100, pp: 10, category: 'status', status: 'burn' });

  test('ほのお技を吸収して発動状態になる', () => {
    const flash = mon('もらいび持ち', { ability: 'flash-fire' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, flash);

    const result = engine.useMove(attacker, flash, flamethrower());

    expect(result.outcome).toBe('failed');
    expect(flash.currentHP).toBe(flash.maxHP);
    expect(flash.flashFireActive).toBe(true);
    expect(flash.abilityRevealed).toBe(true);
  });

  test('変化技（おにび）も吸収する', () => {
    const flash = mon('もらいび持ち', { ability: 'flash-fire' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, flash);

    const result = engine.useMove(attacker, flash, willOWisp());

    expect(result.outcome).toBe('failed');
    expect(flash.status).toBeNull();
    expect(flash.flashFireActive).toBe(true);
  });

  test('発動後はじぶんのほのお技が1.5倍になる', () => {
    const damage = (active: boolean): number => {
      const attacker = mon('もらいび持ち', { ability: 'flash-fire' });
      const defender = mon('相手');
      const engine = new BattleEngine({ rng: new SeededRandom(42) });
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);
      attacker.flashFireActive = active;
      engine.useMove(attacker, defender, flamethrower());
      return defender.maxHP - defender.currentHP;
    };

    const plain = damage(false);
    const boosted = damage(true);

    expect(plain).toBeGreaterThan(0);
    expect(boosted).toBeGreaterThan(plain * 1.3);
  });

  test('場を離れると発動状態が解除される', () => {
    const flash = mon('もらいび持ち', { ability: 'flash-fire' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, flash);
    engine.useMove(attacker, flash, flamethrower());
    expect(flash.flashFireActive).toBe(true);

    engine.switchIn(flash, [flash], 1);

    expect(flash.flashFireActive).toBe(false);
  });
});

describe('でんきにかえる', () => {
  test('攻撃技でダメージを受けるとじゅうでん状態になる', () => {
    const holder = mon('でんきにかえる持ち', { ability: 'electromorphosis' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, holder);

    engine.useMove(attacker, holder, tackle());

    expect(holder.charged).toBe(true);
    expect(holder.abilityRevealed).toBe(true);
  });

  test('変化技やみがわりへの攻撃では発動しない', () => {
    const holder = mon('でんきにかえる持ち', { ability: 'electromorphosis' });
    const attacker = mon('攻撃側');
    const engine = makeEngine(attacker, holder);

    engine.useMove(attacker, holder, thunderWave());
    expect(holder.charged).toBe(false);

    holder.removeStatus();
    holder.substituteHP = 50;
    engine.useMove(attacker, holder, tackle());
    expect(holder.charged).toBe(false);
  });

  test('じゅうでん中はでんき技の威力が2倍になり、使うと解除される', () => {
    const damage = (charged: boolean): { dealt: number; after: boolean } => {
      const attacker = mon('でんきにかえる持ち', { ability: 'electromorphosis' });
      const defender = mon('相手');
      const engine = new BattleEngine({ rng: new SeededRandom(42) });
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);
      attacker.charged = charged;
      engine.useMove(attacker, defender, thunderbolt());
      return { dealt: defender.maxHP - defender.currentHP, after: attacker.charged };
    };

    const plain = damage(false);
    const boosted = damage(true);

    expect(plain.dealt).toBeGreaterThan(0);
    expect(boosted.dealt).toBeGreaterThan(plain.dealt * 1.8);
    expect(boosted.after).toBe(false);
  });

  test('でんき以外の技では解除されず、場を離れると解除される', () => {
    const holder = mon('でんきにかえる持ち', { ability: 'electromorphosis' });
    const defender = mon('相手');
    const engine = makeEngine(holder, defender);
    holder.charged = true;

    engine.useMove(holder, defender, tackle());
    expect(holder.charged).toBe(true);

    engine.switchIn(holder, [holder], 0);
    expect(holder.charged).toBe(false);
  });
});
