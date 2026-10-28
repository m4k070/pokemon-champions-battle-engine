import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { buildPayoffMatrix, chooseSelection, enumerateSelections, findOption, previewOpponent, sampleStrategy, solveMatrixGame } from '../src/ai/selection-matrix.js';
import { buildBelief } from '../src/ai/opponent-belief.js';
import { SeededRandom } from '../src/rng.js';

const stats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const strike = () => createMove({ name: 'すてみタックル', type: 'normal', power: 120, accuracy: 100, pp: 35, category: 'physical' });
const mon = (name: string, atk: number) =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...stats, ATK: atk }, moves: [strike()] });

describe('選出の候補', () => {
  test('6体から3体と先発を選ぶ全通りは60通りで、重複しない', () => {
    const options = enumerateSelections(6);
    expect(options).toHaveLength(60);
    expect(new Set(options.map((option) => option.join(','))).size).toBe(60);
    expect(options.every((option) => option.length === 3 && new Set(option).size === 3)).toBe(true);
  });
});

describe('行列ゲームの解', () => {
  test('じゃんけんは均等に混ぜ、値は0.5', () => {
    const solution = solveMatrixGame([
      [0.5, 0, 1],
      [1, 0.5, 0],
      [0, 1, 0.5],
    ], 20000);
    for (const p of [...solution.row, ...solution.col]) expect(p).toBeCloseTo(1 / 3, 1);
    expect(solution.value).toBeCloseTo(0.5, 2);
    expect(solution.rowGuarantee).toBeGreaterThan(0.48);
  });

  test('支配された候補には確率をほとんど置かない', () => {
    const solution = solveMatrixGame([
      [0.8, 0.7],
      [0.3, 0.2],
    ]);
    expect(solution.row[0]).toBeGreaterThan(0.95);
    expect(solution.col[1]).toBeGreaterThan(0.95);
    expect(solution.value).toBeCloseTo(0.7, 1);
  });

  test('混合戦略から引く', () => {
    const rng = new SeededRandom(3);
    const counts = [0, 0];
    for (let i = 0; i < 1000; i++) counts[sampleStrategy([0.25, 0.75], rng)]!++;
    expect(counts[1]).toBeGreaterThan(650);
    expect(counts[1]).toBeLessThan(850);
  });
});

describe('勝率表', () => {
  test('弱い1体を先発にする候補は勝率が低く、ほとんど選ばれない', async () => {
    const roster = () => [mon('つよい1', 200), mon('つよい2', 200), mon('つよい3', 200), mon('よわい', 50)];
    const table = await buildPayoffMatrix(roster, roster, { gamesPerCell: 2 });
    expect(table.rows).toHaveLength(12);
    expect(table.matrix).toHaveLength(12);
    const mean = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length;
    const strong = table.rows.findIndex((option) => !option.includes(3));
    const withWeak = table.rows.findIndex((option) => option[0] === 3);
    expect(mean(table.matrix[strong]!)).toBeGreaterThan(mean(table.matrix[withWeak]!));
    const solution = solveMatrixGame(table.matrix);
    // 弱い1体を控えに置く組は、3体とも強い組とほとんど変わらないので、先発にする候補だけを見る。
    const weakLeadMass = table.rows.reduce((sum, option, i) => sum + (option[0] === 3 ? solution.row[i]! : 0), 0);
    expect(weakLeadMass).toBeLessThan(0.1);
  });
});

describe('選出を決める', () => {
  const table = {
    rows: [[0, 1, 2], [1, 0, 2], [2, 0, 1]],
    cols: [[0, 1, 2]],
    matrix: [[0.9], [0.5], [0.52]],
    games: 3,
  };

  test('見込みの差がしきい値に届かなければ既定の選出にする', () => {
    const solution = { row: [0, 0, 1], col: [1], value: 0.52, rowGuarantee: 0.52 };
    const choice = chooseSelection(table, solution, 1, new SeededRandom(1), 0.05);
    expect(choice.source).toBe('fallback');
    expect(choice.option).toEqual([1, 0, 2]);
    expect(choice.gain).toBeCloseTo(0.02);
  });

  test('見込みの差がしきい値以上なら引いた候補にする', () => {
    const solution = { row: [1, 0, 0], col: [1], value: 0.9, rowGuarantee: 0.9 };
    const choice = chooseSelection(table, solution, 1, new SeededRandom(1), 0.05);
    expect(choice.source).toBe('matrix');
    expect(choice.option).toEqual([0, 1, 2]);
  });

  test('先発と3体の組で候補を照合する', () => {
    const roster = [mon('a', 100), mon('b', 100), mon('c', 100), mon('d', 100)];
    const options = enumerateSelections(4);
    const index = findOption(options, roster, [roster[2]!, roster[3]!, roster[0]!]);
    expect(options[index]).toEqual([2, 0, 3]);
    expect(findOption(options, roster, [mon('よそ', 100), roster[0]!, roster[1]!])).toBe(-1);
  });

  test('見せ合いの種族だけから、信念の型を試合の番号で入れ替えて当てはめる', () => {
    const setA = mon('a', 100);
    setA.item = 'leftovers';
    const setB = mon('a', 100);
    setB.item = 'life-orb';
    setB.statPoints = { ATK: 32 };
    const belief = buildBelief([[setA], [setB]]);
    const make = previewOpponent(() => [mon('a', 100), mon('なし', 100)], belief);
    const first = make(0);
    const second = make(1);
    expect(first[0]!.item).toBe('leftovers');
    expect(second[0]!.item).toBe('life-orb');
    expect(second[0]!.stats.ATK).toBeGreaterThan(first[0]!.stats.ATK);
    expect(first[1]!.item).toBeNull();
    // 候補の無い種族は、実物の技・特性を使わず、仮の一致技と特性なしにする。
    expect(first[1]!.moves.map((move) => move.name)).toEqual(['仮の一致技（normal）']);
    expect(first[1]!.moves[0]!.power).toBe(80);
    expect(first[1]!.ability).toBe('none');
  });
});
