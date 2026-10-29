import { Pokemon } from '../src/pokemon.js';
import { createMove, type DamageMoveInput } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { HybridBattleAgent } from '../src/ai/hybrid-battle-agent.js';
import { selectTeam } from '../src/ai/team-selection.js';
import type { BattleContext } from '../src/ai/battle-agent.js';

// 全ソースのレビュー（2026-10-29）で「気になる点」として残した項目の回帰テスト。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  types?: Pokemon['types'];
  ability?: Pokemon['ability'];
  item?: Pokemon['item'];
  moves?: Pokemon['moves'];
  speed?: number;
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: options.item ?? null,
    baseStats: { ...stats, SPEED: options.speed ?? 100 },
    moves: options.moves ?? [],
  });

const attack = (name: string, type: Pokemon['types'][number], extra: Partial<DamageMoveInput> = {}) =>
  createMove({ power: 80, accuracy: 100, pp: 10, category: 'special', ...extra, name, type });
const lightScreen = () =>
  createMove({ name: 'ひかりのかべ', type: 'psychic', accuracy: 100, pp: 30, category: 'status', fieldEffect: 'light-screen' });
const swordsDance = () =>
  createMove({ name: 'つるぎのまい', type: 'normal', accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });

function engineWith(a: Pokemon, b: Pokemon): BattleEngine {
  const engine = new BattleEngine({ rng: new SeededRandom(1) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  return engine;
}

// 壁の補正だけを見る（基礎ダメージ100・急所なし）。
const walled = (engine: BattleEngine, attacker: Pokemon, defender: Pokemon, move: ReturnType<typeof attack>): number =>
  engine.applyModifiers(100, attacker, defender, move, { critical: false }).finalDamage;

describe('ひかりのかべ', () => {
  test('特殊技だけを半減し、物理技はそのまま', () => {
    const user = mon('使う側');
    const target = mon('壁側');
    const engine = engineWith(user, target);
    const special = attack('ハイパーボイス', 'normal');
    const physical = attack('すてみタックル', 'normal', { category: 'physical' });
    const specialBefore = walled(engine, user, target, special);
    const physicalBefore = walled(engine, user, target, physical);

    expect(engine.useMove(target, user, lightScreen()).outcome).toBe('effect-applied');
    expect(engine.field.lightScreen.playerB).toBe(5);
    expect(walled(engine, user, target, special))
      .toBe(50);
    expect(walled(engine, user, target, physical)).toBe(physicalBefore);
  });

  test('張られている間は張り直せず、5ターンで消える', () => {
    const user = mon('使う側');
    const target = mon('壁側');
    const engine = engineWith(user, target);
    engine.useMove(target, user, lightScreen());
    expect(engine.field.lightScreen.playerB).toBe(5);
    expect(engine.useMove(target, user, lightScreen()).outcome).toBe('no-effect');
    for (let i = 0; i < 5; i++) engine.startTurn();
    expect(engine.field.lightScreen.playerB).toBe(0);
  });

  test('オーロラベールと重なっても半減は1回だけ', () => {
    const user = mon('使う側');
    const target = mon('壁側');
    const engine = engineWith(user, target);
    engine.field.reflect.playerB = 5;
    engine.field.lightScreen.playerB = 5;
    engine.field.auroraVeil.playerB = 5;
    expect(walled(engine, user, target, attack('すてみタックル', 'normal', { category: 'physical' }))).toBe(50);
    expect(walled(engine, user, target, attack('ハイパーボイス', 'normal'))).toBe(50);
  });
});

describe('エレキフィールド', () => {
  test('エレキメイカーを持たないポケモンのでんき技も強くなる', () => {
    const power = (terrain: 'electric-terrain' | null) => {
      const user = mon('使う側');
      const target = mon('相手');
      const engine = engineWith(user, target);
      engine.field.terrain = terrain;
      engine.field.terrainTurnsLeft = terrain === null ? 0 : 5;
      let captured = 0;
      engine.events.on('calculate-attack', (data) => {
        captured = (data.move as { power: number }).power;
      });
      engine.useMove(user, target, attack('10まんボルト', 'electric', { power: 90 }));
      return captured;
    };
    expect(power(null)).toBe(90);
    expect(power('electric-terrain')).toBe(117);
  });

  test('接地しているポケモンは眠らない（ねむりごな・あくび）', () => {
    const user = mon('使う側');
    const target = mon('相手');
    const engine = engineWith(user, target);
    engine.field.terrain = 'electric-terrain';
    engine.field.terrainTurnsLeft = 5;
    const sleepPowder = createMove({ name: 'ねむりごな', type: 'grass', accuracy: 100, pp: 15, category: 'status', status: 'sleep' });
    const yawn = createMove({ name: 'あくび', type: 'normal', accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });
    expect(engine.useMove(user, target, sleepPowder).outcome).toBe('no-effect');
    expect(engine.useMove(user, target, yawn).outcome).toBe('no-effect');
    expect(target.status).toBeNull();
    expect(target.isDrowsy).toBe(false);
  });

  test('グラスフィールドは技で張れて、同じフィールドの上では失敗する', () => {
    const user = mon('使う側');
    const target = mon('相手');
    const engine = engineWith(user, target);
    const grassyTerrain = createMove({ name: 'グラスフィールド', type: 'grass', accuracy: 100, pp: 10, category: 'status', fieldEffect: 'grassy-terrain' });
    expect(engine.useMove(user, target, grassyTerrain).outcome).toBe('effect-applied');
    expect(engine.field.terrain).toBe('grassy-terrain');
    expect(engine.useMove(user, target, { ...grassyTerrain, pp: 10 }).outcome).toBe('no-effect');
  });
});

describe('技の開示（不完全情報）', () => {
  test('眠っていて出なかった技は相手に見えず、出た技は見える', async () => {
    const a = mon('A', { moves: [attack('かくしわざ', 'normal'), attack('みせわざ', 'normal')] });
    const b = mon('B', { moves: [attack('わざ', 'normal', { power: 1 })] });
    const session = await BattleSession.start([a], [b], { information: 'partial', rng: new SeededRandom(1) });
    a.applyStatus('sleep', new SeededRandom(1));
    session.beginTurn();
    session.applyTurn({ action: { type: 'move', moveIndex: 0, target: 0 } }, { action: { type: 'move', moveIndex: 0, target: 0 } });
    session.endTurn();
    expect(session.getContext(1).opponent.moves).toEqual([]);

    a.removeStatus();
    session.beginTurn();
    session.applyTurn({ action: { type: 'move', moveIndex: 1, target: 0 } }, { action: { type: 'move', moveIndex: 0, target: 0 } });
    expect(session.getContext(1).opponent.moves.map((move) => move.name)).toEqual(['みせわざ']);
  });

  test('場の相手とチーム内の同じ個体は同じ複製を指す', async () => {
    const session = await BattleSession.start(
      [mon('A', { moves: [attack('わざ', 'normal')] })],
      [mon('B1', { moves: [attack('わざ', 'normal')] }), mon('B2', { moves: [attack('わざ', 'normal')] })],
      { information: 'partial' },
    );
    const context = session.getContext(0);
    expect(context.opponentTeam).toContain(context.opponent);
  });
});

describe('相手が先に倒れたターン', () => {
  test('自分に使う技はそのまま出る', async () => {
    // B が先に動き、反動で倒れる。そのあと A のつるぎのまいは出る。
    const recoil = attack('すてみ', 'normal', { category: 'physical', power: 1, recoilPercent: 1 });
    const a = mon('A', { moves: [swordsDance()], speed: 50 });
    const b = mon('B', { moves: [recoil], speed: 150 });
    const session = await BattleSession.start([a], [b, mon('B2', { moves: [attack('わざ', 'normal')] })]);
    b.currentHP = 1;
    session.beginTurn();
    session.applyTurn({ action: { type: 'move', moveIndex: 0, target: 0 } }, { action: { type: 'move', moveIndex: 0, target: 0 } });
    expect(b.isFainted).toBe(true);
    expect(a.statStages.ATK).toBe(2);
  });
});

describe('メガストーンの判定', () => {
  test('選出は -x / -y のメガストーンもメガ枠として扱う', () => {
    const team = [mon('ふつう1'), mon('リザードン', { item: 'charizardite-x' }), mon('ふつう2'), mon('ふつう3')];
    // 始動役がいないので、メガ枠が先頭（エース）に来る。詰め枠の評価で拾われるのとは区別する。
    expect(selectTeam(team).members[0]).toBe(team[1]);
  });
});

describe('ハイブリッド方策', () => {
  test('LLM が技を差し替えても、メガシンカの判断は引き継ぐ', async () => {
    const self = mon('エース', { moves: [attack('わざ1', 'normal'), attack('わざ2', 'normal')] });
    const opponent = mon('相手', { moves: [attack('わざ', 'normal')] });
    const context = {
      turn: 3,
      self,
      selfTeam: [self],
      opponent,
      opponentTeam: [opponent],
      canMegaEvolve: true,
      mustSwitch: false,
      field: {
        weather: null, weatherTurnsLeft: 0,
        terrain: null, terrainTurnsLeft: 0,
        trickRoom: false, trickRoomTurnsLeft: 0,
        stealthRock: { self: false, opponent: false }, spikes: { self: 0, opponent: 0 }, toxicSpikes: { self: 0, opponent: 0 },
      },
      recentLog: [],
    } as unknown as BattleContext;
    const agent = new HybridBattleAgent(new SeededRandom(1), {
      apiKey: 'test',
      ask: async () => '{"action":{"type":"move","moveIndex":1}}',
    });
    const decision = await agent.consultForced(context, { action: { type: 'move', moveIndex: 0, target: 0, megaEvolve: true } });
    expect(decision.action).toEqual({ type: 'move', moveIndex: 1, target: 0, megaEvolve: true });
  });
});
