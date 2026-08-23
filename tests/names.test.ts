import { ABILITY_NAMES, isAbilityName } from '../src/ability-names.js';
import { ITEM_NAMES, isItemName } from '../src/item-names.js';
import { ABILITY_REGISTRY } from '../src/rules/abilities/registry.js';
import { MEGA_STONE_SEEDS } from '../src/rules/mega-evolution.js';

describe('ABILITY_NAMES', () => {
  test('重複した特性名を含まない', () => {
    expect(new Set(ABILITY_NAMES).size).toBe(ABILITY_NAMES.length);
  });

  test('レジストリに登録された特性は全て列挙に含まれる', () => {
    // AbilityDefinition.name が AbilityName 型なので型でも保証されるが、
    // レジストリの構築（Object.fromEntries）でキーが落ちていないことを実行時にも確認する。
    for (const name of Object.keys(ABILITY_REGISTRY)) {
      expect(ABILITY_NAMES).toContain(name);
    }
  });

  test('isAbilityName は既知の特性名だけを通す', () => {
    expect(isAbilityName('mold-breaker')).toBe(true);
    expect(isAbilityName('none')).toBe(true);
    expect(isAbilityName('mold-braker')).toBe(false);
    expect(isAbilityName('')).toBe(false);
  });
});

describe('ITEM_NAMES', () => {
  test('重複した持ち物名を含まない', () => {
    expect(new Set(ITEM_NAMES).size).toBe(ITEM_NAMES.length);
  });

  test('メガストーンは全て列挙に含まれる', () => {
    for (const item of Object.keys(MEGA_STONE_SEEDS)) {
      expect(ITEM_NAMES).toContain(item);
    }
  });

  test('isItemName は既知の持ち物名だけを通す', () => {
    expect(isItemName('choice-band')).toBe(true);
    expect(isItemName('charizardite-x')).toBe(true);
    expect(isItemName('choice_band')).toBe(false);
    expect(isItemName('')).toBe(false);
  });
});
