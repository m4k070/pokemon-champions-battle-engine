import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';
import { SeededRandom } from '../src/rng.js';

// はてなブログ M-6 の構築（lab に取り込み）で使われていて、名前だけだった持ち物・特性・メガシンカ。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  types?: Pokemon['types'];
  ability?: Pokemon['ability'];
  item?: Pokemon['item'];
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: options.item ?? null,
    baseStats: stats,
    moves: [],
  });

const move = (name: string, type: Pokemon['types'][number], category: 'physical' | 'special' = 'special') =>
  createMove({ name, type, power: 80, accuracy: 100, pp: 10, category });

function damage(attacker: Pokemon, defender: Pokemon, used: ReturnType<typeof createMove>): number {
  const engine = new BattleEngine({ rng: new SeededRandom(3) });
  engine.setActivePokemon(0, attacker);
  engine.setActivePokemon(1, defender);
  engine.useMove(attacker, defender, used);
  return defender.maxHP - defender.currentHP;
}

describe('タイプ強化の持ち物', () => {
  test.each([
    ['dragon-fang', 'dragon'],
    ['mystic-water', 'water'],
    ['black-glasses', 'dark'],
    ['spell-tag', 'ghost'],
  ] as const)('%s は %s 技を1.2倍にする', (item, type) => {
    const plain = damage(mon('攻撃側'), mon('相手', { types: ['fighting'] }), move('技', type));
    const boosted = damage(mon('攻撃側', { item }), mon('相手', { types: ['fighting'] }), move('技', type));
    expect(boosted / plain).toBeGreaterThan(1.1);
    expect(boosted / plain).toBeLessThan(1.3);
  });

  test('対応しないタイプの技は強化しない', () => {
    const plain = damage(mon('攻撃側'), mon('相手'), move('技', 'fire'));
    expect(damage(mon('攻撃側', { item: 'dragon-fang' }), mon('相手'), move('技', 'fire'))).toBe(plain);
  });
});

describe('ひかりのねんど', () => {
  test('オーロラベールが8ターン続く', () => {
    const user = mon('アローラキュウコン', { item: 'light-clay' });
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, mon('相手'));
    engine.weather = 'snow';
    engine.useMove(user, mon('相手'), createMove({ name: 'オーロラベール', type: 'ice', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: 'aurora-veil' }));
    expect(engine.field.auroraVeil.playerA).toBe(8);
  });
});

describe('すいほう', () => {
  test('みず技の威力2倍', () => {
    const plain = damage(mon('攻撃側'), mon('相手'), move('なみのり', 'water'));
    const boosted = damage(mon('オニシズクモ', { ability: 'water-bubble' }), mon('相手'), move('なみのり', 'water'));
    expect(boosted / plain).toBeGreaterThan(1.8);
  });

  test('受けるほのお技は半減し、やけどにならない', () => {
    const plain = damage(mon('攻撃側'), mon('相手'), move('かえんほうしゃ', 'fire'));
    const halved = damage(mon('攻撃側'), mon('オニシズクモ', { ability: 'water-bubble' }), move('かえんほうしゃ', 'fire'));
    expect(halved / plain).toBeLessThan(0.6);
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    expect(engine.blocksStatusByAbility(mon('オニシズクモ', { ability: 'water-bubble' }), 'burn')).toBe(true);
  });
});

describe('きれあじ', () => {
  test('切る技は1.5倍、それ以外は変わらない', () => {
    const slash = () => move('つじぎり', 'dark', 'physical');
    const plain = damage(mon('攻撃側'), mon('相手'), slash());
    const sharp = damage(mon('アブソル', { ability: 'sharpness' }), mon('相手'), slash());
    expect(sharp / plain).toBeGreaterThan(1.4);
    const claw = () => move('シャドークロー', 'ghost', 'physical');
    const target = () => mon('相手', { types: ['psychic'] });
    expect(damage(mon('アブソル', { ability: 'sharpness' }), target(), claw())).toBe(damage(mon('攻撃側'), target(), claw()));
  });

  test('カタログの技名（ひけん・ちえなみ）も切る技', () => {
    const edge = () => move('ひけん・ちえなみ', 'dark', 'physical');
    expect(damage(mon('ダイケンキ', { ability: 'sharpness' }), mon('相手'), edge()) / damage(mon('攻撃側'), mon('相手'), edge())).toBeGreaterThan(1.4);
  });
});

describe('フェアリーオーラ', () => {
  const fairy = () => move('ムーンフォース', 'fairy', 'special');
  test('使う側でも受ける側でも、フェアリー技は約1.33倍', () => {
    const plain = damage(mon('攻撃側'), mon('相手'), fairy());
    expect(damage(mon('メガフラエッテ', { ability: 'fairy-aura' }), mon('相手'), fairy()) / plain).toBeGreaterThan(1.25);
    expect(damage(mon('攻撃側'), mon('メガフラエッテ', { ability: 'fairy-aura' }), fairy()) / plain).toBeGreaterThan(1.25);
  });
  test('フェアリー以外の技は変わらない', () => {
    const slash = () => move('つじぎり', 'dark', 'physical');
    expect(damage(mon('メガフラエッテ', { ability: 'fairy-aura' }), mon('相手'), slash())).toBe(damage(mon('攻撃側'), mon('相手'), slash()));
  });
});

describe('追加したメガシンカ', () => {
  test.each([
    ['froslass', 'froslassite', 'mega-froslass', ['ice', 'ghost'], 'snow-warning'],
    ['absol', 'absolite-z', 'mega-absol-z', ['dark', 'ghost'], 'sharpness'],
    ['staraptor', 'staraptite', 'mega-staraptor', ['fighting', 'flying'], 'contrary'],
  ] as const)('%s は %s で %s になる', (species, item, megaName, types, ability) => {
    const pokemon = new Pokemon({ name: species, types: ['normal'], ability: 'none', item, baseStats: stats, moves: [] });
    const system = new MegaEvolutionSystem();
    expect(system.canMegaEvolve(pokemon)).toBe(true);
    system.megaEvolve(pokemon);
    expect(pokemon.name).toBe(megaName);
    expect(pokemon.types).toEqual(types);
    expect(pokemon.ability).toBe(ability);
  });
});

describe('ちょうはつ（技）', () => {
  const taunt = () => createMove({ name: 'ちょうはつ', type: 'dark', power: 0, accuracy: 100, pp: 20, category: 'status', inflictsTaunt: true });
  const swordsDance = () =>
    createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });

  test('相手を3ターン挑発し、変化技を選べなくする', () => {
    const user = mon('グソクムシャ');
    const target = new Pokemon({ name: 'カバルドン', types: ['ground'], ability: 'none', item: null, baseStats: stats, moves: [swordsDance(), move('じしん', 'ground', 'physical')] });
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    engine.useMove(user, target, taunt());
    expect(target.tauntTurnsLeft).toBe(3);
    expect(target.canUseMove(0)).toBe(false);
    expect(target.canUseMove(1)).toBe(true);
    expect(engine.useMove(target, user, target.moves[0]!)).toEqual({ outcome: 'failed', reason: 'taunted' });
  });

  test('みがわりを貫通する', () => {
    const user = mon('グソクムシャ');
    const target = mon('相手');
    target.substituteHP = 50;
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    engine.useMove(user, target, taunt());
    expect(target.isTaunted).toBe(true);
  });
});

describe('ゆき（チャンピオンズの天候）', () => {
  const engineWith = (weather: 'snow' | 'sand' | null) => {
    const engine = new BattleEngine({ rng: new SeededRandom(2) });
    engine.weather = weather;
    return engine;
  };

  test('毎ターンのダメージが無い', () => {
    const target = mon('相手');
    const engine = engineWith('snow');
    engine.setActivePokemon(0, target);
    engine.endTurn([target], []);
    expect(target.currentHP).toBe(target.maxHP);
  });

  test('こおりタイプのぼうぎょ1.5倍、すなあらしはいわタイプのとくぼう1.5倍', () => {
    const ice = mon('こおり', { types: ['ice'] });
    const rock = mon('いわ', { types: ['rock'] });
    const physical = move('たいあたり', 'normal', 'physical');
    const special = move('スピードスター', 'normal', 'special');
    expect(engineWith('snow').calculateDefense(ice, physical)).toBe(Math.floor(engineWith(null).calculateDefense(ice, physical) * 1.5));
    expect(engineWith('snow').calculateDefense(ice, special)).toBe(engineWith(null).calculateDefense(ice, special));
    expect(engineWith('sand').calculateDefense(rock, special)).toBe(Math.floor(engineWith(null).calculateDefense(rock, special) * 1.5));
  });

  test('ふぶきはゆきの間は必中', () => {
    let missed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const attacker = mon('攻撃側');
      const defender = mon('相手');
      const engine = new BattleEngine({ rng: new SeededRandom(seed) });
      engine.weather = 'snow';
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);
      const result = engine.useMove(attacker, defender, createMove({ name: 'ふぶき', type: 'ice', power: 110, accuracy: 70, pp: 5, category: 'special' }));
      if (result.outcome === 'failed') missed++;
    }
    expect(missed).toBe(0);
  });
});

describe('いたずらごころ', () => {
  const willOWisp = () => createMove({ name: 'おにび', type: 'fire', power: 0, accuracy: 85, pp: 15, category: 'status', status: 'burn' });
  const swordsDance = () =>
    createMove({ name: 'つるぎのまい', type: 'normal', power: 0, accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });

  test('変化技の優先度が+1になり、攻撃技は変わらない', () => {
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    const banette = mon('メガジュペッタ', { ability: 'prankster' });
    expect(engine.movePriority(banette, willOWisp())).toBe(1);
    expect(engine.movePriority(banette, move('シャドークロー', 'ghost', 'physical'))).toBe(0);
    expect(engine.movePriority(mon('相手'), willOWisp())).toBe(0);
  });

  test('あくタイプの相手には、相手に向けた変化技が効かない（自分に使う技は出せる）', () => {
    const engine = new BattleEngine({ rng: new SeededRandom(1) });
    const banette = mon('メガジュペッタ', { ability: 'prankster' });
    const dark = mon('アブソル', { types: ['dark'] });
    engine.setActivePokemon(0, banette);
    engine.setActivePokemon(1, dark);
    expect(engine.useMove(banette, dark, willOWisp())).toEqual({ outcome: 'failed', reason: 'blocked-by-ability' });
    expect(dark.status).toBeNull();
    expect(engine.useMove(banette, dark, swordsDance()).outcome).not.toBe('failed');
  });
});
