import { Pokemon } from '../src/pokemon.js';
import { createMove, type DamageMoveInput } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { PimcBattleAgent, type SpeciesSet } from '../src/ai/pimc-battle-agent.js';

// 全ソースのレビュー（2026-10-29）で見つけた不具合の回帰テスト。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

interface MonOptions {
  types?: Pokemon['types'];
  ability?: Pokemon['ability'];
  moves?: Pokemon['moves'];
}

const mon = (name: string, options: MonOptions = {}): Pokemon =>
  new Pokemon({
    name,
    types: options.types ?? ['normal'],
    ability: options.ability ?? 'none',
    item: null,
    baseStats: stats,
    moves: options.moves ?? [],
  });

const swordsDance = () =>
  createMove({ name: 'つるぎのまい', type: 'normal', accuracy: 100, pp: 20, category: 'status', selfStatChange: [{ stat: 'ATK', delta: 2 }] });
const stealthRock = () =>
  createMove({ name: 'ステルスロック', type: 'rock', accuracy: 100, pp: 20, category: 'status', fieldEffect: 'stealth-rock' });
const willOWisp = () => createMove({ name: 'おにび', type: 'fire', accuracy: 100, pp: 15, category: 'status', status: 'burn' });
const taunt = () => createMove({ name: 'ちょうはつ', type: 'dark', accuracy: 100, pp: 20, category: 'status', inflictsTaunt: true });
const attack = (name: string, type: Pokemon['types'][number], extra: Partial<DamageMoveInput> = {}) =>
  createMove({ power: 80, accuracy: 100, pp: 10, category: 'special', ...extra, name, type });

function engineWith(a: Pokemon, b: Pokemon): BattleEngine {
  const engine = new BattleEngine({ rng: new SeededRandom(1) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  return engine;
}

describe('マジックミラー', () => {
  test('自分に使う技は跳ね返らない', () => {
    const user = mon('使う側');
    const bouncer = mon('メガアブソル', { ability: 'magic-bounce' });
    engineWith(user, bouncer).useMove(user, bouncer, swordsDance());
    expect(user.statStages.ATK).toBe(2);
    expect(bouncer.statStages.ATK).toBe(0);
  });

  test('相手の場に置く技は使った側の場に跳ね返る', () => {
    const user = mon('使う側');
    const bouncer = mon('メガアブソル', { ability: 'magic-bounce' });
    const engine = engineWith(user, bouncer);
    engine.useMove(user, bouncer, stealthRock());
    expect(engine.field.stealthRock.playerA).toBe(true);
    expect(engine.field.stealthRock.playerB).toBe(false);
  });

  test('かたやぶりの技は跳ね返せない。跳ね返した技は跳ね返した側の直前の技にならない', () => {
    const breaker = mon('かたやぶり', { ability: 'mold-breaker' });
    const bouncer = mon('メガアブソル', { ability: 'magic-bounce' });
    engineWith(breaker, bouncer).useMove(breaker, bouncer, willOWisp());
    expect(bouncer.status).toBe('burn');

    const user = mon('使う側');
    const other = mon('メガアブソル', { ability: 'magic-bounce' });
    other.recordLastMove('かみくだく');
    engineWith(user, other).useMove(user, other, willOWisp());
    expect(user.status).toBe('burn');
    expect(other.lastMoveName).toBe('かみくだく');
  });
});

describe('まもる', () => {
  test('防がれた技も PP が減り、使った技として記録される', () => {
    const user = mon('使う側');
    const guard = mon('まもる側');
    const engine = engineWith(user, guard);
    guard.protecting = true;
    const used = attack('10まんボルト', 'electric');
    expect(engine.useMove(user, guard, used)).toEqual({ outcome: 'failed', reason: 'protected' });
    expect(used.pp).toBe(9);
    expect(engine.moveLog.map((entry) => entry.moveName)).toContain('10まんボルト');
  });

  test('ちょうはつも防ぐ', () => {
    const user = mon('使う側');
    const guard = mon('まもる側');
    const engine = engineWith(user, guard);
    guard.protecting = true;
    expect(engine.useMove(user, guard, taunt()).outcome).toBe('failed');
    expect(guard.isTaunted).toBe(false);
  });
});

describe('技の名前による判定（カタログは日本語表記）', () => {
  test('ウェザーボールは天候下でタイプが変わり、威力が2倍になる', () => {
    const damage = (weather: 'rain' | null) => {
      const user = mon('使う側');
      const target = mon('相手');
      const engine = engineWith(user, target);
      engine.weather = weather;
      engine.useMove(user, target, attack('ウェザーボール', 'normal', { name: 'ウェザーボール', type: 'normal', power: 50 }));
      return target.maxHP - target.currentHP;
    };
    // 雨: みず技（威力100）×雨1.5。無天候はノーマル（威力50）×タイプ一致1.5。
    expect(damage('rain') / damage(null)).toBeGreaterThan(1.8);
  });

  test('ぼうだんはシャドーボールを防ぐ', () => {
    const user = mon('使う側');
    const target = mon('ブリガロン', { ability: 'bulletproof' });
    const result = engineWith(user, target).useMove(user, target, attack('シャドーボール', 'ghost'));
    expect(result).toEqual({ outcome: 'failed', reason: 'blocked-by-ability' });
    expect(target.currentHP).toBe(target.maxHP);
  });
});

describe('効果が無かったとき', () => {
  test('タイプ無効のインファイトでは使用者の能力も下がらない', () => {
    const user = mon('使う側');
    const ghost = mon('ゴースト', { types: ['ghost'] });
    const closeCombat = attack('インファイト', 'fighting', {
      name: 'インファイト', type: 'fighting', category: 'physical', power: 120,
      selfStatChange: [{ stat: 'DEF', delta: -1 }, { stat: 'SPDEF', delta: -1 }],
    });
    engineWith(user, ghost).useMove(user, ghost, closeCombat);
    expect(user.statStages.DEF).toBe(0);
  });

  test('くさタイプへのやどりぎのタネは効果なしで返す', () => {
    const user = mon('使う側');
    const grass = mon('くさ', { types: ['grass'] });
    const seed = createMove({ name: 'やどりぎのタネ', type: 'grass', accuracy: 100, pp: 10, category: 'status', inflictsSeed: true });
    expect(engineWith(user, grass).useMove(user, grass, seed).outcome).toBe('no-effect');
    expect(grass.isSeeded).toBe(false);
  });
});

describe('交代', () => {
  const move = (index: number) => ({ action: { type: 'move' as const, moveIndex: index, target: 0 } });

  test('ドラゴンテールで引きずり出されたポケモンは、そのターン技を出さない', async () => {
    const dragonTail = attack('ドラゴンテール', 'dragon', {
      name: 'ドラゴンテール', type: 'dragon', category: 'physical', power: 60, priority: -6, forcesSwitch: true,
    });
    // B はより遅い優先度（-7）の技を選ぶので、ドラゴンテールの後に動く番だった。
    const slow = attack('おそいわざ', 'normal', { name: 'おそいわざ', type: 'normal', power: 80, priority: -7 });
    const a = mon('A', { moves: [dragonTail] });
    const b1 = mon('B1', { moves: [slow] });
    const b2 = mon('B2', { moves: [attack('ひかえのわざ', 'normal', { name: 'ひかえのわざ', type: 'normal', power: 80, priority: -7 })] });
    const session = await BattleSession.start([a], [b1, b2]);
    session.beginTurn();
    session.applyTurn(move(0), move(0));
    expect(session.activeB).toBe(b2);
    expect(a.currentHP).toBe(a.maxHP);
    expect(session.engine.getLog()).not.toContain('B2のひかえのわざ');
  });

  test('場を離れると直前の技とまもるの連続回数が消える', async () => {
    const a1 = mon('A1', { moves: [attack('わざ', 'normal')] });
    const a2 = mon('A2', { moves: [attack('わざ', 'normal')] });
    const b = mon('B', { moves: [attack('わざ', 'normal')] });
    const session = await BattleSession.start([a1, a2], [b]);
    a1.recordLastMove('わざ');
    a1.protectStreak = 2;
    session.beginTurn();
    session.applyTurn({ action: { type: 'switch', pokemonIndex: 1 } }, move(0));
    expect(a1.lastMoveName).toBeNull();
    expect(a1.protectStreak).toBe(0);
  });

  test('もらいびの強化状態は局面の複製に引き継がれる', async () => {
    const a = mon('A', { ability: 'flash-fire', moves: [attack('わざ', 'normal')] });
    const session = await BattleSession.start([a], [mon('B', { moves: [attack('わざ', 'normal')] })]);
    a.flashFireActive = true;
    expect(session.fork().activeA.flashFireActive).toBe(true);
  });
});

describe('PIMC の埋め方', () => {
  test('メガシンカ前の名前で候補を引き、開示済みの技と矛盾する候補は使わない', () => {
    const tackle = attack('たいあたり', 'normal');
    const sets = [
      { moves: [attack('かみくだく', 'dark')], item: 'leftovers', ability: 'none' },
      { moves: [attack('たいあたり', 'normal'), attack('ムーンフォース', 'fairy')], item: 'life-orb', ability: 'none' },
    ] as SpeciesSet[];
    const agent = new PimcBattleAgent(new Map([['フラエッテ', sets]]), 8, 1);
    const mega = mon('メガフラエッテ', { moves: [tackle] });
    mega.baseName = 'フラエッテ';
    for (let i = 0; i < 8; i++) {
      const filled = agent.determinize(mega);
      expect(filled.moves.map((move) => move.name)).toEqual(['たいあたり', 'ムーンフォース']);
      expect(filled.item).toBe('life-orb');
    }
  });
});
