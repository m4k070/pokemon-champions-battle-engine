import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove, type MoveInput } from '../src/move.js';
import { SeededRandom } from '../src/rng.js';
import { fixedRandom } from './helpers/scripted-random.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';
import type { Stats, TypeName } from '../src/types.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';

const FIXED: Stats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const move = (over: MoveInput) => createMove({ pp: 10, maxPP: 10, accuracy: 100, ...over });

// ヤドキング（通常・M-7 151位）。実採用は さいせいりょく＋たべのこし／つめたいいわ。
function slowking(over: { item?: ItemName | null; ability?: AbilityName } = {}): Pokemon {
  return new Pokemon({
    name: 'ヤドキング',
    types: ['water', 'psychic'],
    ability: over.ability ?? 'regenerator',
    item: over.item ?? 'leftovers',
    baseStats: { HP: 95, ATK: 75, DEF: 80, SPATK: 100, SPDEF: 110, SPEED: 30 },
    stats: { ...FIXED, SPEED: 30 },
    moves: [],
  });
}

function dummy(name: string, types: TypeName[] = ['normal'], base: Partial<Stats> = {}): Pokemon {
  return new Pokemon({
    name,
    types,
    ability: 'none',
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100, ...base },
    stats: { ...FIXED, SPEED: 1 },
    moves: [],
  });
}

// さむいギャグ: 手持ちと入れ替わり、5ターン（つめたいいわで8ターン）雪にする。
const chillyReception = () =>
  move({ name: 'さむいギャグ', type: 'ice', category: 'status', pp: 12, weather: 'snow', pivot: true });

// アシッドボム: 特殊どく40。100%で相手のとくぼう -2。
const acidSpray = () =>
  move({
    name: 'アシッドボム',
    type: 'poison',
    category: 'special',
    power: 40,
    pp: 20,
    targetStatChange: [{ stat: 'SPDEF', delta: -2, chance: 100 }],
  });

describe('さむいギャグ', () => {
  test('雪を5ターンにして pivot 扱いになる（交代は runner 側）', () => {
    const engine = new BattleEngine();
    const user = slowking();
    const foe = dummy('Foe');
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);

    const result = engine.useMove(user, foe, chillyReception());

    expect(result).toEqual({ outcome: 'effect-applied', pivot: true });
    expect(engine.weather).toBe('snow');
    expect(engine.weatherTurnsLeft).toBe(5);
    expect(foe.currentHP).toBe(foe.maxHP); // 変化技なので相手は無傷
  });

  test('つめたいいわを持つと8ターンになる', () => {
    const engine = new BattleEngine();
    const user = slowking({ item: 'icy-rock' });
    const foe = dummy('Foe');
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);

    engine.useMove(user, foe, chillyReception());

    expect(engine.weather).toBe('snow');
    expect(engine.weatherTurnsLeft).toBe(8);
  });

  test('控えと交代し、着地した側が雪の恩恵を受ける（セッション経由）', async () => {
    const user = slowking();
    const bench = dummy('セグレイブ', ['dragon', 'ice'], { DEF: 92 });
    const foe = dummy('Foe');
    user.moves = [chillyReception()];
    bench.moves = [move({ name: 'はねる', type: 'normal', category: 'status', pp: 40 })];
    foe.moves = [move({ name: 'はねる', type: 'normal', category: 'status', pp: 40 })];

    const agent: BattleAgent = {
      selectLead: async (team) => team[0]!,
      selectAction: async (context) => context.mustSwitch
        ? { action: { type: 'switch', pokemonIndex: context.selfTeam.findIndex((p) => p !== context.self && !p.isFainted) } }
        : { action: { type: 'move', moveIndex: 0, target: 0 } },
    };
    const session = await BattleSession.start([user, bench], [foe], { rng: new SeededRandom(1) });
    await session.playTurn(agent, agent);

    expect(session.activeA).toBe(bench); // さむいギャグで退場し、控えが着地
    expect(session.engine.weather).toBe('snow');
  });

  test('控えがいない場合は交代せず、天候だけが変わる（本編の失敗条件は未確認）', async () => {
    const user = slowking();
    user.moves = [chillyReception()];
    const foe = dummy('Foe');
    foe.moves = [move({ name: 'はねる', type: 'normal', category: 'status', pp: 40 })];

    const agent: BattleAgent = {
      selectLead: async (team) => team[0]!,
      selectAction: async (context) => context.mustSwitch
        ? { action: { type: 'switch', pokemonIndex: context.selfTeam.findIndex((p) => p !== context.self && !p.isFainted) } }
        : { action: { type: 'move', moveIndex: 0, target: 0 } },
    };
    const session = await BattleSession.start([user], [foe], { rng: new SeededRandom(1) });
    await session.playTurn(agent, agent);

    expect(session.activeA).toBe(user);
    expect(session.engine.weather).toBe('snow');
  });
});

describe('雪と こおりタイプ', () => {
  test('雪の間は こおりタイプの物理耐久が1.5倍になる', () => {
    // 同じ乱数で「雪なし／雪あり」のダメージを比べる（急所・乱数の差では説明できない形にする）。
    const damageWith = (snow: boolean): number => {
      const engine = new BattleEngine({ rng: fixedRandom(0.85) });
      const attacker = dummy('Attacker', ['fighting'], { ATK: 145 });
      const defender = dummy('セグレイブ', ['dragon', 'ice'], { DEF: 92, HP: 115 });
      engine.setActivePokemon(0, attacker);
      engine.setActivePokemon(1, defender);
      if (snow) {
        engine.weather = 'snow';
        engine.weatherTurnsLeft = 5;
      }
      const result = engine.useMove(
        attacker,
        defender,
        move({ name: 'インファイト', type: 'fighting', category: 'physical', power: 120, accuracy: 100 }),
      );
      return result.outcome === 'damaged' ? result.damage : 0;
    };

    const plain = damageWith(false);
    const snowy = damageWith(true);
    expect(snowy).toBeLessThan(plain);
    expect(snowy / plain).toBeCloseTo(2 / 3, 1); // 1.5倍の防御 ≒ ダメージ2/3
  });
});

describe('アシッドボム', () => {
  test('相手のとくぼうを2段階下げる', () => {
    const engine = new BattleEngine();
    const user = slowking();
    const foe = dummy('Foe');
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);

    const result = engine.useMove(user, foe, acidSpray());

    expect(result.outcome).toBe('damaged');
    expect(foe.statStages.SPDEF).toBe(-2);
  });

  test('2回で-4まで下がり、以降の特殊ダメージが増える', () => {
    const engine = new BattleEngine({ rng: fixedRandom(0.85) });
    const user = slowking();
    // HPを大きく取る（3発で倒れると能力低下の検証にならない）。
    const foe = new Pokemon({
      name: 'Foe',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      stats: { ...FIXED, HP: 600, SPEED: 1 },
      moves: [],
    });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, foe);

    const first = engine.useMove(user, foe, acidSpray());
    const damageAt0 = first.outcome === 'damaged' ? first.damage : 0;
    engine.useMove(user, foe, acidSpray());
    const third = engine.useMove(user, foe, acidSpray());

    expect(foe.statStages.SPDEF).toBe(-6); // 3回で下限
    const damageAt6 = third.outcome === 'damaged' ? third.damage : 0;
    expect(damageAt6).toBeGreaterThan(damageAt0);
  });
});
