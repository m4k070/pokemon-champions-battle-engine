import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleEngine } from '../src/battle-engine.js';
import { SeededRandom } from '../src/rng.js';

// はてなブログ M-6 の構築で使われていて、未実装だった技（本編仕様）。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const mon = (name: string, types: Pokemon['types'] = ['normal'], item: Pokemon['item'] = null): Pokemon =>
  new Pokemon({ name, types, ability: 'none', item, baseStats: stats, moves: [] });

function setup(a: Pokemon, b: Pokemon, teamA: Pokemon[] = [a], teamB: Pokemon[] = [b]): BattleEngine {
  const engine = new BattleEngine({ rng: new SeededRandom(4) });
  engine.setActivePokemon(0, a);
  engine.setActivePokemon(1, b);
  engine.registerTeams(teamA, teamB);
  return engine;
}

const surf = () => createMove({ name: 'なみのり', type: 'water', power: 90, accuracy: 100, pp: 15, category: 'special' });
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 35, category: 'physical', contact: true });

describe('ミラーコート', () => {
  const mirrorCoat = () =>
    createMove({ name: 'ミラーコート', type: 'psychic', power: 0, accuracy: 100, pp: 20, category: 'special', priority: -5, reflectsSpecialDamage: true });

  test('そのターンに受けた特殊ダメージの2倍を返す', () => {
    const user = mon('オニシズクモ');
    const foe = mon('相手');
    const engine = setup(user, foe);
    engine.useMove(foe, user, surf());
    const taken = user.maxHP - user.currentHP;
    const result = engine.useMove(user, foe, mirrorCoat());
    expect(result).toMatchObject({ outcome: 'damaged', damage: taken * 2 });
  });

  test('特殊技を受けていなければ失敗する', () => {
    const user = mon('オニシズクモ');
    const foe = mon('相手');
    const engine = setup(user, foe);
    engine.useMove(foe, user, tackle());
    expect(engine.useMove(user, foe, mirrorCoat()).outcome).toBe('no-effect');
    expect(foe.currentHP).toBe(foe.maxHP);
  });

  test('あくタイプには効かない', () => {
    const user = mon('オニシズクモ');
    const foe = mon('相手', ['dark']);
    const engine = setup(user, foe);
    engine.useMove(foe, user, surf());
    expect(engine.useMove(user, foe, mirrorCoat())).toMatchObject({ outcome: 'no-effect', reason: 'type-immune' });
  });
});

describe('ねばねばネット', () => {
  test('相手の場に張られ、出てきた接地ポケモンの素早さを1段階下げる', () => {
    const user = mon('オニシズクモ');
    const foe = mon('相手');
    const engine = setup(user, foe);
    engine.useMove(user, foe, createMove({ name: 'ねばねばネット', type: 'bug', power: 0, accuracy: 100, pp: 20, category: 'status', fieldEffect: 'sticky-web' }));
    expect(engine.field.stickyWeb.playerB).toBe(true);
    const grounded = mon('接地');
    const flying = mon('ひこう', ['flying']);
    engine.switchIn(grounded, [grounded], 1);
    engine.switchIn(flying, [flying], 1);
    expect(grounded.statStages.SPEED).toBe(-1);
    expect(flying.statStages.SPEED).toBe(0);
  });
});

describe('いやしのねがい', () => {
  const healingWish = () => createMove({ name: 'いやしのねがい', type: 'psychic', power: 0, accuracy: 100, pp: 10, category: 'status', healingWish: true });

  test('自分が倒れ、次に出たポケモンのHPと状態異常を回復する', () => {
    const user = mon('イエッサン');
    const ally = mon('グソクムシャ');
    ally.takeDamage(150);
    ally.applyStatus('burn');
    const foe = mon('相手');
    const engine = setup(user, foe, [user, ally], [foe]);
    engine.useMove(user, foe, healingWish());
    expect(user.isFainted).toBe(true);
    engine.switchIn(ally, [user, ally], 0);
    expect(ally.currentHP).toBe(ally.maxHP);
    expect(ally.status).toBeNull();
  });

  test('控えがいなければ失敗する', () => {
    const user = mon('イエッサン');
    const foe = mon('相手');
    const engine = setup(user, foe);
    expect(engine.useMove(user, foe, healingWish()).outcome).toBe('no-effect');
    expect(user.isFainted).toBe(false);
  });
});

describe('ゆきなだれ', () => {
  test('先に攻撃を受けていれば威力2倍', () => {
    const avalanche = () => createMove({ name: 'ゆきなだれ', type: 'ice', power: 60, accuracy: 100, pp: 10, category: 'physical', priority: -4, doublesIfHitFirst: true });
    const plainUser = mon('ギャラドス');
    const plainFoe = mon('相手');
    const e1 = setup(plainUser, plainFoe);
    e1.useMove(plainUser, plainFoe, avalanche());
    const plain = plainFoe.maxHP - plainFoe.currentHP;

    const hitUser = mon('ギャラドス');
    const hitFoe = mon('相手');
    const e2 = setup(hitUser, hitFoe);
    e2.useMove(hitFoe, hitUser, tackle());
    e2.useMove(hitUser, hitFoe, avalanche());
    expect((hitFoe.maxHP - hitFoe.currentHP) / plain).toBeGreaterThan(1.8);
  });
});

describe('フリーズドライ', () => {
  test('みずタイプに効果抜群', () => {
    const freezeDry = createMove({ name: 'フリーズドライ', type: 'ice', power: 70, accuracy: 100, pp: 20, category: 'special', superEffectiveOnWater: true });
    const engine = setup(mon('アローラキュウコン'), mon('相手', ['water']));
    expect(engine.resolveTypeEffectiveness(mon('a'), mon('b', ['water']), freezeDry)).toBe(2);
    expect(engine.resolveTypeEffectiveness(mon('a'), mon('b', ['water', 'flying']), freezeDry)).toBe(4);
    expect(engine.resolveTypeEffectiveness(mon('a'), mon('b', ['normal']), freezeDry)).toBe(1);
  });
});

describe('ゴツゴツメット・さめはだ', () => {
  test('接触技を受けると攻撃者に攻撃者の最大HPの1/6', () => {
    const attacker = mon('攻撃側');
    const holder = mon('アーマーガア', ['normal'], 'rocky-helmet');
    const engine = setup(attacker, holder);
    engine.useMove(attacker, holder, tackle());
    expect(attacker.maxHP - attacker.currentHP).toBe(Math.floor(attacker.maxHP / 6));
    const engine2 = setup(attacker, holder);
    const hpBefore = attacker.currentHP;
    engine2.useMove(attacker, holder, createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' }));
    expect(attacker.currentHP).toBe(hpBefore);
  });

  test('さめはだは攻撃者の最大HPの1/8', () => {
    const attacker = new Pokemon({ name: '攻撃側', types: ['normal'], ability: 'none', item: null, baseStats: { ...stats, HP: 50 }, moves: [] });
    const sharkskin = new Pokemon({ name: 'ガブリアス', types: ['normal'], ability: 'rough-skin', item: null, baseStats: { ...stats, HP: 150 }, moves: [] });
    const engine = setup(attacker, sharkskin);
    engine.useMove(attacker, sharkskin, tackle());
    expect(attacker.maxHP - attacker.currentHP).toBe(Math.floor(attacker.maxHP / 8));
  });
});
