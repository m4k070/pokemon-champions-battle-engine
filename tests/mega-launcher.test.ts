import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { createMove } from '../src/move.js';
import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';
import { fixedRandom } from './helpers/scripted-random.js';
import { asDamageResult } from './helpers/use-move-result.js';
import type { AbilityName } from '../src/ability-names.js';
import type { TypeName } from '../src/types.js';

// メガランチャー（メガカメックスの特性）の検証。
// 本編仕様: 波動技（はどうだん・あくのはどう・だいちのはどう・みずのはどう・りゅうのはどう・こんげんのはどう）の
// 威力が1.5倍になる。非波動技には影響しない。

function makePokemon(params: { name?: string; types?: TypeName[]; ability?: AbilityName } = {}): Pokemon {
  return new Pokemon({
    name: params.name ?? 'Mon',
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: null,
    baseStats: { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
  });
}

function damageOf(ability: AbilityName, moveName: string, moveType: TypeName, power: number): number {
  const engine = new BattleEngine({ rng: fixedRandom(0.5) });
  const user = makePokemon({ name: 'User', types: ['water'], ability });
  const target = makePokemon({ name: 'Target', types: ['normal'] });
  engine.setActivePokemon(0, user);
  engine.setActivePokemon(1, target);
  const move = createMove({ name: moveName, type: moveType, power, accuracy: 100, category: 'special', pp: 10 });
  const result = asDamageResult(engine.useMove(user, target, move));
  return result.damage;
}

describe('波動技のフラグ', () => {
  test('波動技は名前から自動で pulse になる', () => {
    const auraSphere = createMove({ name: 'はどうだん', type: 'fighting', power: 80, accuracy: 100, category: 'special' });
    expect(auraSphere.pulse).toBe(true);
  });

  test('非波動技は pulse にならない', () => {
    const thunderbolt = createMove({ name: '10まんボルト', type: 'electric', power: 90, accuracy: 100, category: 'special' });
    expect(thunderbolt.pulse).toBe(false);
  });

  test('明示指定は名前の既定より優先される', () => {
    const move = createMove({ name: 'はどうだん', type: 'fighting', power: 80, accuracy: 100, category: 'special', pulse: false });
    expect(move.pulse).toBe(false);
  });
});

describe('メガランチャーの威力補正', () => {
  test('波動技は1.5倍になる', () => {
    const without = damageOf('none', 'はどうだん', 'fighting', 80);
    const withLauncher = damageOf('mega-launcher', 'はどうだん', 'fighting', 80);
    expect(without).toBeGreaterThan(0);
    expect(withLauncher / without).toBeCloseTo(1.5, 1);
  });

  test('非波動技は変わらない', () => {
    const without = damageOf('none', '10まんボルト', 'electric', 90);
    const withLauncher = damageOf('mega-launcher', '10まんボルト', 'electric', 90);
    expect(withLauncher).toBe(without);
  });

  test('だいちのはどうでも1.5倍が乗る（フィールド補正と重なる）', () => {
    const without = damageOf('none', 'だいちのはどう', 'normal', 50);
    const withLauncher = damageOf('mega-launcher', 'だいちのはどう', 'normal', 50);
    expect(withLauncher / without).toBeCloseTo(1.5, 1);
  });

  test('あくのはどう・みずのはどう・りゅうのはどうも対象', () => {
    for (const [name, type] of [['あくのはどう', 'dark'], ['みずのはどう', 'water'], ['りゅうのはどう', 'dragon']] as const) {
      const without = damageOf('none', name, type, 80);
      const withLauncher = damageOf('mega-launcher', name, type, 80);
      expect(withLauncher / without).toBeCloseTo(1.5, 1);
    }
  });
});

describe('メガカメックスとしての挙動', () => {
  test('メガシンカでメガランチャーを獲得する', () => {
    // メガカメックス（カメックスナイト）のメガ後特性が mega-launcher であることを確認する。
    const system = new MegaEvolutionSystem();
    const blastoise = new Pokemon({
      name: 'カメックス',
      baseName: 'blastoise',
      types: ['water'],
      ability: 'torrent',
      item: 'blastoisinite',
      baseStats: { HP: 79, ATK: 83, DEF: 100, SPATK: 85, SPDEF: 105, SPEED: 78 },
    });

    expect(system.canMegaEvolve(blastoise)).toBe(true);
    expect(system.megaEvolve(blastoise)).toBe(true);
    expect(blastoise.ability).toBe('mega-launcher');
  });
});
