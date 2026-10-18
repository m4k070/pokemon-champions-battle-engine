import { TeamPreview, DEFAULT_PARTY_SIZE } from '../src/team-preview.js';
import type { SelectionDecision } from '../src/team-preview.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { seededRandom } from '../src/rng.js';

const BASE = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 60 };

function makePokemon(name: string, baseStats = BASE, ability: 'none' | 'battle-switch' = 'none'): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability,
    item: null,
    baseStats,
    moves: [createMove({ name: 'tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 20 })],
  });
}

function makeRoster(prefix: string, size = 6): Pokemon[] {
  return Array.from({ length: size }, (_, index) => makePokemon(`${prefix}${index + 1}`));
}

const select = (pokemonIndices: number[]): SelectionDecision => ({
  action: { type: 'select', pokemonIndices },
});

// 選出を確定させる（両者）。
function settle(preview: TeamPreview, side0: number[], side1: number[]): void {
  preview.applySelection(0, select(side0));
  preview.applySelection(1, select(side1));
}

describe('TeamPreview: 選出候補の列挙', () => {
  test('6体から3体なら60通り（集合20 × 先発3）を重複なく列挙する', () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));

    const selections = preview.legalSelections(0);

    expect(DEFAULT_PARTY_SIZE).toBe(3);
    expect(selections).toHaveLength(60);
    expect(new Set(selections.map((s) => s.join(','))).size).toBe(60);
    for (const selection of selections) {
      expect(selection).toHaveLength(3);
      expect(new Set(selection).size).toBe(3);
      expect(selection.every((index) => index >= 0 && index < 6)).toBe(true);
    }

    // 同じ集合でも先発だけが違う枝が3通りずつ存在する
    const bySet = new Map<string, number>();
    for (const selection of selections) {
      const key = [...selection].sort((a, b) => a - b).join(',');
      bySet.set(key, (bySet.get(key) ?? 0) + 1);
    }
    expect(bySet.size).toBe(20);
    expect([...bySet.values()].every((count) => count === 3)).toBe(true);
  });

  test('partySize を変えられる', async () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'), { partySize: 1 });

    expect(preview.legalSelections(0)).toHaveLength(6);
    settle(preview, [4], [2]);
    const session = await preview.startBattle();

    expect(session.teamA.map((p) => p.name)).toEqual(['A5']);
    expect(session.teamB.map((p) => p.name)).toEqual(['B3']);
  });

  test('手持ちより多い匹数は見せ合いの開始時に拒否する', () => {
    expect(() => TeamPreview.begin(makeRoster('A', 2), makeRoster('B'), { partySize: 3 }))
      .toThrow(/手持ちを超えています/);
  });
});

describe('TeamPreview: 選出の検証', () => {
  test('体数違い・重複・範囲外・選出以外の行動を拒否する', () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));
    const notSelection = { action: { type: 'switch', pokemonIndex: 0 } } as unknown as SelectionDecision;

    expect(() => preview.applySelection(0, select([0, 1]))).toThrow(/3体である必要があります/);
    expect(() => preview.applySelection(0, select([0, 0, 1]))).toThrow(/同じポケモンが含まれています/);
    expect(() => preview.applySelection(0, select([0, 1, 6]))).toThrow(/選出先が不正です/);
    expect(() => preview.applySelection(0, notSelection)).toThrow(/select以外の行動/);
  });

  test('瀕死のポケモンは選べない', () => {
    const rosterA = makeRoster('A');
    rosterA[2].currentHP = 0;
    const preview = TeamPreview.begin(rosterA, makeRoster('B'));

    expect(() => preview.applySelection(0, select([0, 1, 2]))).toThrow(/瀕死のポケモンは選べません/);
  });

  test('同じ側を二度選出することはできない', () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));
    preview.applySelection(0, select([0, 1, 2]));

    expect(() => preview.applySelection(0, select([3, 4, 5]))).toThrow(/既に選出済みです/);
  });
});

describe('TeamPreview: 対戦への引き継ぎ', () => {
  test('両者の選出が揃うまで対戦は始まらない', async () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));

    expect(preview.needsSelection(0)).toBe(true);
    expect(preview.isComplete()).toBe(false);
    await expect(preview.startBattle()).rejects.toThrow(/選出が確定していません/);

    preview.applySelection(0, select([2, 0, 1]));
    expect(preview.isComplete()).toBe(false);
    await expect(preview.startBattle()).rejects.toThrow(/side=1/);

    preview.applySelection(1, select([0, 1, 2]));
    expect(preview.isComplete()).toBe(true);

    const session = await preview.startBattle();
    // 先発は配列の先頭、控えは選んだ3体のみ（選ばなかった3体は対戦に入らない）
    expect(session.activeA.name).toBe('A3');
    expect(session.teamA.map((p) => p.name)).toEqual(['A3', 'A1', 'A2']);
    expect(session.activeB.name).toBe('B1');
    expect(session.teamB.map((p) => p.name)).toEqual(['B1', 'B2', 'B3']);
  });

  test('同じ見せ合いから作った2つの対戦は状態を共有しない', async () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));
    settle(preview, [0, 1, 2], [0, 1, 2]);

    const first = await preview.startBattle();
    const second = await preview.startBattle();

    first.activeA.currentHP = 1;
    first.activeA.moves[0].pp = 0;

    expect(second.activeA.currentHP).toBe(second.activeA.maxHP);
    expect(second.activeA.moves[0].pp).toBe(20);
    expect(preview.roster(0)[0].currentHP).toBe(preview.roster(0)[0].maxHP);
  });

  test('選出したポケモンは元の手持ちと別実体で、フォルム定義や持ち物も保たれる', async () => {
    const withForms = new Pokemon({
      name: 'A1',
      types: ['steel'],
      ability: 'battle-switch',
      item: 'leftovers',
      baseStats: { ...BASE, ATK: 180 },
      moves: [createMove({ name: 'tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 20 })],
      formStats: {
        normal: { baseStats: BASE },
        blade: { baseStats: { ...BASE, ATK: 180 } },
      },
    });
    const preview = TeamPreview.begin([withForms], [makePokemon('B1')], { partySize: 1 });
    settle(preview, [0], [0]);

    const session = await preview.startBattle();

    expect(session.activeA).not.toBe(withForms);
    expect(session.activeA.item).toBe('leftovers');
    expect(session.activeA.formStats).not.toBeNull();
    // 選出を経てもフォルムチェンジが機能する（= formStats が複製されている）
    expect(session.activeA.setForm('blade').outcome).toBe('changed');
    // 元の手持ちは変化しない（選出が参照を共有していない）
    expect(withForms.form).toBe('normal');
  });

  test('battle オプション（乱数など）は対戦へ引き継がれる', async () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'), { battle: { rng: seededRandom(7) } });
    settle(preview, [0, 1, 2], [0, 1, 2]);

    const session = await preview.startBattle();

    expect(session.engine.rng.getState()).not.toBeNull();
  });
});

describe('TeamPreview: fork と view', () => {
  test('fork は選出状態を引き継ぎ、手持ちを共有しない', () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));
    preview.applySelection(0, select([1, 2, 3]));

    const forked = preview.fork();

    expect(forked.selection(0)).toEqual([1, 2, 3]);
    expect(forked.needsSelection(1)).toBe(true);
    expect(forked.view(0).ownSelection).toEqual([1, 2, 3]);

    // 手持ちは別実体。fork 側を傷つけても元に波及しない
    forked.roster(0)[1].currentHP = 1;
    expect(preview.roster(0)[1].currentHP).toBe(preview.roster(0)[1].maxHP);

    // 片側だけ確定した状態の枝分かれもできる
    forked.applySelection(1, select([3, 4, 5]));
    expect(forked.isComplete()).toBe(true);
    expect(preview.isComplete()).toBe(false);
  });

  test('view は種族とタイプだけを見せ、選出は確定後に現れる', () => {
    const preview = TeamPreview.begin(makeRoster('A'), makeRoster('B'));

    const before = preview.view(0);
    expect(before.partySize).toBe(3);
    expect(before.ownRoster).toHaveLength(6);
    expect(before.opponentRoster[0]).toEqual({ name: 'B1', types: ['normal'] });
    expect(before.ownSelection).toBeNull();
    expect(before.opponentSelection).toBeNull();
    expect(before.needsSelection).toBe(true);
    // 持ち物・技は見せ合いでは見えない
    expect(JSON.stringify(before)).not.toContain('tackle');

    preview.applySelection(0, select([5, 4, 3]));
    const after = preview.view(0);
    expect(after.ownSelection).toEqual([5, 4, 3]);
    expect(after.needsSelection).toBe(false);
    expect(after.opponentSelection).toBeNull();
  });
});
