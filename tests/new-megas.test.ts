import { Pokemon } from '../src/pokemon.js';
import { createMove, type DamageMoveInput } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { SeededRandom } from '../src/rng.js';
import { MegaEvolutionSystem, MEGA_STONE_ITEMS } from '../src/rules/mega-evolution.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';

// pokedb 上位構築に出るメガ（2026-10-31 追加）と、その特性の回帰テスト。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  types?: Pokemon['types'];
  ability?: AbilityName;
  item?: ItemName | null;
  baseStats?: typeof stats;
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: options.item ?? null,
    baseStats: options.baseStats ?? stats,
    moves: [],
  });

const attack = (name: string, type: Pokemon['types'][number], extra: Partial<DamageMoveInput> = {}) =>
  createMove({ power: 80, accuracy: 100, pp: 10, category: 'physical', ...extra, name, type });

function engineWith(a: Pokemon, b: Pokemon, seed = 1): BattleEngine {
  const engine = new BattleEngine({ rng: new SeededRandom(seed) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  return engine;
}

// 計算に渡された技の威力（タイプ・特性の補正後）を捕まえる。
function powerOf(attacker: Pokemon, move: ReturnType<typeof attack>, defender = mon('相手')): { power: number; type: string } {
  const engine = engineWith(attacker, defender);
  let captured = { power: 0, type: '' };
  engine.events.on('calculate-attack', (data) => {
    const used = data.move as { power: number; type: string };
    captured = { power: used.power, type: used.type };
  });
  engine.useMove(attacker, defender, move);
  return captured;
}

const NEW_STONES: [ItemName, string, AbilityName][] = [
  ['starminite', 'starmie', 'huge-power'],
  ['meganiumite', 'meganium', 'mega-sol'],
  ['glimmoranite', 'glimmora', 'adaptability'],
  ['skarmorite', 'skarmory', 'stalwart'],
  ['slowbronite', 'slowbro', 'shell-armor'],
  ['tyranitarite', 'tyranitar', 'sand-stream'],
  // カエンジシは PokeAPI の既定の形（pokemon-species の is_default）が pyroar-male。
  ['pyroarite', 'pyroar-male', 'fire-mane'],
  ['heracronite', 'heracross', 'skill-link'],
  ['baxcalibrite', 'baxcalibur', 'thermal-exchange'],
  ['excadrite', 'excadrill', 'piercing-drill'],
  ['feraligite', 'feraligatr', 'dragonize'],
  ['absolite', 'absol', 'magic-bounce'],
];

describe('追加したメガストーン', () => {
  test.each(NEW_STONES)('%s で %s がメガシンカし、特性が %s になる', (item, species, ability) => {
    const system = new MegaEvolutionSystem();
    const pokemon = mon(species, { item });
    expect(MEGA_STONE_ITEMS.has(item)).toBe(true);
    expect(system.canMegaEvolve(pokemon)).toBe(true);
    system.megaEvolve(pokemon);
    expect(pokemon.isMega).toBe(true);
    expect(pokemon.ability).toBe(ability);
  });

  test('メガスターミーの種族値・タイプ（PokeAPI starmie-mega: 60-100-105-130-105-120、みず/エスパー）', () => {
    const starmie = mon('starmie', { item: 'starminite', types: ['water', 'psychic'], baseStats: { HP: 60, ATK: 75, DEF: 85, SPATK: 100, SPDEF: 85, SPEED: 115 } });
    new MegaEvolutionSystem().megaEvolve(starmie);
    expect(starmie.baseStats).toEqual({ HP: 60, ATK: 100, DEF: 105, SPATK: 130, SPDEF: 105, SPEED: 120 });
    expect(starmie.types).toEqual(['water', 'psychic']);
    expect(starmie.name).toBe('mega-starmie');
  });

  test('アブソルは従来のアブソルナイトZと新しいアブソルナイトで別のメガになる', () => {
    const z = mon('absol', { item: 'absolite-z' });
    const classic = mon('absol', { item: 'absolite' });
    const system = new MegaEvolutionSystem();
    system.megaEvolve(z);
    system.megaEvolve(classic);
    expect(z.ability).toBe('sharpness');
    expect(classic.ability).toBe('magic-bounce');
    expect(classic.types).toEqual(['dark']);
  });

  test('対象でないポケモンはメガシンカできない', () => {
    expect(new MegaEvolutionSystem().canMegaEvolve(mon('scovillain', { item: 'sceptilite' }))).toBe(false);
  });
});

describe('威力を変える特性', () => {
  test('ちからもち・ヨガパワーはこうげきだけを2倍にし、とくこうには掛からない', () => {
    const physical = attack('たいあたり', 'normal');
    const special = attack('スピードスター', 'normal', { category: 'special' });
    for (const ability of ['huge-power', 'pure-power'] as const) {
      const user = mon('使う側', { ability });
      const engine = engineWith(user, mon('相手'));
      expect(engine.calculateAttack(user, physical)).toBe(user.stats.ATK * 2);
      expect(engine.calculateAttack(user, special)).toBe(user.stats.SPATK);
    }
  });

  test('がんじょうあご・てつのこぶし・Fire Mane', () => {
    expect(powerOf(mon('A', { ability: 'strong-jaw' }), attack('かみくだく', 'dark')).power).toBe(120);
    // 使用者はノーマルタイプなので、タイプ一致の補正が乗らない技で比べる。
    expect(powerOf(mon('A', { ability: 'strong-jaw' }), attack('アクアテール', 'water')).power).toBe(80);
    expect(powerOf(mon('A', { ability: 'iron-fist' }), attack('れいとうパンチ', 'ice', { power: 75 })).power).toBe(90);
    expect(powerOf(mon('A', { ability: 'iron-fist' }), attack('スカイアッパー', 'fighting', { power: 85 })).power).toBe(102);
    expect(powerOf(mon('A', { ability: 'fire-mane' }), attack('かえんほうしゃ', 'fire', { power: 90, category: 'special' })).power).toBe(135);
  });

  test('ドラゴンスキンはノーマル技をドラゴン技にし、威力1.2倍', () => {
    expect(powerOf(mon('A', { ability: 'dragonize' }), attack('すてみタックル', 'normal', { power: 120 })))
      .toEqual({ power: 144, type: 'dragon' });
  });

  test('メガソーラーの技は晴れの補正を受ける', () => {
    const user = mon('A', { ability: 'mega-sol' });
    const plain = mon('B');
    const engine = engineWith(user, plain);
    const fire = attack('かえんほうしゃ', 'fire', { power: 90, category: 'special' });
    const water = attack('なみのり', 'water', { power: 90, category: 'special' });
    expect(engine.calculateBaseDamage(100, 100, fire, user)).toBeGreaterThan(engine.calculateBaseDamage(100, 100, fire, plain));
    expect(engine.calculateBaseDamage(100, 100, water, user)).toBeLessThan(engine.calculateBaseDamage(100, 100, water, plain));
    expect(engine.weatherFor(plain)).toBeNull();
  });

  test('サンパワー: 晴れでとくこう1.5倍、ターン終了時に1/8を失う', () => {
    const user = mon('A', { ability: 'solar-power' });
    const engine = engineWith(user, mon('B'));
    const special = attack('かえんほうしゃ', 'fire', { power: 90, category: 'special' });
    expect(engine.calculateAttack(user, special)).toBe(user.stats.SPATK);
    engine.weather = 'sun';
    engine.weatherTurnsLeft = 5;
    expect(engine.calculateAttack(user, special)).toBe(Math.floor(user.stats.SPATK * 1.5));
    engine.endTurn([user], []);
    expect(user.currentHP).toBe(user.maxHP - Math.floor(user.maxHP / 8));
  });
});

describe('技の解決を変える特性', () => {
  test('スキルリンク: 連続技は必ず5回当たる', () => {
    const user = mon('A', { ability: 'skill-link' });
    const target = mon('B');
    const engine = engineWith(user, target);
    engine.useMove(user, target, attack('ロックブラスト', 'rock', { power: 25, multiHit: true }));
    expect(engine.getLog()).toContain('5回攻撃した！');
  });

  test('ちからずく: 威力1.3倍で、追加効果は出ない。能力が下がる効果は残る', () => {
    const user = mon('A', { ability: 'sheer-force' });
    const burnMove = attack('ねっぷう', 'fire', { power: 100, category: 'special', secondaryEffect: { status: 'burn', chance: 100 } });
    expect(powerOf(user, burnMove).power).toBe(130);

    const target = mon('B');
    const engine = engineWith(user, target);
    engine.useMove(user, target, burnMove);
    expect(target.status).toBeNull();

    const closeCombat = attack('インファイト', 'fighting', { power: 120, selfStatChange: [{ stat: 'DEF', delta: -1 }] });
    expect(powerOf(mon('A', { ability: 'sheer-force' }), closeCombat).power).toBe(120);
    const user2 = mon('A', { ability: 'sheer-force' });
    const target2 = mon('B');
    engineWith(user2, target2).useMove(user2, target2, closeCombat);
    expect(user2.statStages.DEF).toBe(-1);
  });

  test('ちからずくで打ち消した技では、いのちのたまの反動を受けない', () => {
    const user = mon('A', { ability: 'sheer-force', item: 'life-orb' });
    const target = mon('B');
    const engine = engineWith(user, target);
    engine.startTurn();
    engine.useMove(user, target, attack('ねっぷう', 'fire', { power: 100, category: 'special', secondaryEffect: { status: 'burn', chance: 10 } }));
    engine.endTurn([user], [target]);
    expect(user.currentHP).toBe(user.maxHP);
  });

  test('ふかしのこぶし: 接触技はまもるを貫通し、接触しない技は防がれる', () => {
    const user = mon('A', { ability: 'unseen-fist' });
    const target = mon('B');
    const engine = engineWith(user, target);
    target.protecting = true;
    expect(engine.useMove(user, target, attack('かみなりパンチ', 'electric', { contact: true })).outcome).toBe('damaged');
    expect(engine.useMove(user, target, attack('じしん', 'ground')).outcome).toBe('failed');
  });

  test('かんつうドリル: まもるを貫通した接触技は1/4のダメージ', () => {
    const user = mon('A', { ability: 'piercing-drill' });
    const target = mon('B');
    const engine = engineWith(user, target);
    const drill = attack('ドリルライナー', 'ground', { contact: true });
    const open = engine.applyModifiers(100, user, target, drill, { critical: false }).finalDamage;
    target.protecting = true;
    expect(engine.applyModifiers(100, user, target, drill, { critical: false }).finalDamage).toBe(Math.floor(open / 4));
    expect(engine.useMove(user, target, drill).outcome).toBe('damaged');
  });

  test('フィルター: 効果抜群のダメージを3/4にする（かたやぶりは無視）', () => {
    const user = mon('A');
    const target = mon('B', { ability: 'filter', types: ['steel'] });
    const engine = engineWith(user, target);
    const fighting = attack('インファイト', 'fighting');
    expect(engine.applyModifiers(100, user, target, fighting, { critical: false }).finalDamage).toBe(150);
    const breaker = mon('C', { ability: 'mold-breaker' });
    expect(engine.applyModifiers(100, breaker, target, fighting, { critical: false }).finalDamage).toBe(200);
  });

  test('すりぬけ: 壁とみがわりを無視する', () => {
    const user = mon('A', { ability: 'infiltrator' });
    const target = mon('B');
    const engine = engineWith(user, target);
    engine.field.reflect.playerB = 5;
    expect(engine.applyModifiers(100, user, target, attack('たいあたり', 'normal'), { critical: false }).finalDamage).toBe(100);

    target.substituteHP = 50;
    engine.useMove(user, target, attack('たいあたり', 'normal', { power: 40 }));
    expect(target.substituteHP).toBe(50);
    expect(target.currentHP).toBeLessThan(target.maxHP);
  });

  test('ぎゃくじょう: 攻撃でHPが半分を下回ると、とくこうが上がる', () => {
    const user = mon('A');
    const target = mon('B', { ability: 'berserk' });
    const engine = engineWith(user, target);
    target.currentHP = Math.floor(target.maxHP * 0.55);
    const hit = Math.floor(target.maxHP * 0.1);
    engine.applyDamage(target, hit, user, attack('たいあたり', 'normal'));
    expect(target.statStages.SPATK).toBe(1);
    engine.applyDamage(target, hit, user, attack('たいあたり', 'normal'));
    expect(target.statStages.SPATK).toBe(1);
  });
});
