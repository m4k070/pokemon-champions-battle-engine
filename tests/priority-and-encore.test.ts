import { Pokemon } from '../src/pokemon.js';
import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { createMove } from '../src/move.js';
import { fixedRandom } from './helpers/scripted-random.js';

function makePokemon(params: {
  name: string; speed: number; moves: ReturnType<typeof createMove>[];
}): Pokemon {
  return new Pokemon({
    name: params.name,
    types: ['water'],
    ability: 'none',
    item: null,
    // HP 1: どちらも一撃で倒れるので「先に動いた側が勝つ」が解決順の検証になる。
    baseStats: { HP: 1, ATK: 200, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: params.speed },
    moves: params.moves,
  });
}

const shadowSneak = () => createMove({
  name: 'かげうち', type: 'ghost', power: 40, accuracy: 100, category: 'physical', priority: 1,
});
const shadowClaw = () => createMove({
  name: 'シャドークロー', type: 'ghost', power: 40, accuracy: 100, category: 'physical',
});
const tackle = () => createMove({
  name: 'tackle', type: 'normal', power: 40, accuracy: 100, category: 'physical',
});

// どちらも一撃で倒せる火力なので「先に動いた側が勝つ」= 解決順がそのまま勝敗になる。
async function playOneTurn(attackerMoves: ReturnType<typeof createMove>[]) {
  const slow = makePokemon({ name: 'Slow', speed: 1, moves: attackerMoves });
  const fast = makePokemon({ name: 'Fast', speed: 200, moves: [tackle()] });
  const session = await BattleSession.start([slow], [fast], { rng: fixedRandom(0.5) });
  const agent = new RandomBattleAgent(fixedRandom(0.5));
  await session.playTurn(agent, agent);
  return session;
}

describe('かげうち（優先度+1のゴースト物理技）', () => {
  test('すばやさが低くても優先度+1の技が先に解決して勝つ', async () => {
    // Act
    const session = await playOneTurn([shadowSneak()]);

    // Assert: 遅い側（優先度+1）が先手を取る
    expect(session.isFinished()).toBe(true);
    expect(session.winner()).toBe(0);
  });

  test('優先度が無ければ速い側が先手を取る（比較対照）', async () => {
    // Act
    const session = await playOneTurn([shadowClaw()]);

    // Assert: 速い側が勝つ
    expect(session.isFinished()).toBe(true);
    expect(session.winner()).toBe(1);
  });
});

describe('アンコール（相手の直前の技を3ターン固定する）', () => {
  const encore = () => createMove({
    name: 'アンコール', type: 'normal', category: 'status', inflictsEncore: true,
  });

  function makeEngine() {
    const engine = new BattleEngine({ rng: fixedRandom(0.5) });
    const user = makePokemon({ name: 'User', speed: 100, moves: [encore()] });
    const target = makePokemon({ name: 'Target', speed: 50, moves: [tackle(), shadowClaw()] });
    engine.setActivePokemon(0, user);
    engine.setActivePokemon(1, target);
    return { engine, user, target };
  }

  test('相手が直前に使った技が固定され、他の技は選べなくなる', () => {
    // Arrange
    const { engine, user, target } = makeEngine();
    engine.useMove(target, user, target.moves[1]); // 相手はシャドークローを使った

    // Act
    const result = engine.useMove(user, target, encore());

    // Assert
    expect(result.outcome).toBe('effect-applied');
    expect(target.isEncored).toBe(true);
    expect(target.encoredMoveIndex).toBe(1);
    expect(target.canUseMove(1)).toBe(true);   // 固定された技は選べる
    expect(target.canUseMove(0)).toBe(false);  // 他の技は選べない
  });

  test('固定された技以外を使おうとすると failed（encored）になる', () => {
    // Arrange
    const { engine, user, target } = makeEngine();
    engine.useMove(target, user, target.moves[1]);
    engine.useMove(user, target, encore());

    // Act
    const other = engine.useMove(target, user, target.moves[0]);
    const encored = engine.useMove(target, user, target.moves[1]);

    // Assert
    expect(other.outcome).toBe('failed');
    if (other.outcome !== 'failed') throw new Error('unreachable');
    expect(other.reason).toBe('encored');
    expect(encored.outcome).toBe('damaged');
  });

  test('3ターンの間は固定が続き、それを過ぎると解除される', () => {
    // Arrange
    const { engine, user, target } = makeEngine();
    engine.startTurn();                       // ターン1
    engine.useMove(target, user, target.moves[1]);
    engine.useMove(user, target, encore());   // ターン1でアンコール

    // Act & Assert: ターン2〜4は固定が続く
    engine.startTurn();                       // ターン2
    expect(target.isEncored).toBe(true);
    engine.startTurn();                       // ターン3
    expect(target.isEncored).toBe(true);
    engine.startTurn();                       // ターン4
    expect(target.isEncored).toBe(true);

    engine.startTurn();                       // ターン5
    expect(target.isEncored).toBe(false);
    expect(engine.getLog()).toContain('アンコールが解けた');
  });

  test('交代で解除される（resetEncore）', () => {
    // Arrange
    const { engine, user, target } = makeEngine();
    engine.useMove(target, user, target.moves[1]);
    engine.useMove(user, target, encore());
    expect(target.isEncored).toBe(true);

    // Act
    target.resetEncore();

    // Assert
    expect(target.isEncored).toBe(false);
    expect(target.encoredUntilTurn).toBeNull();
    expect(target.canUseMove(0)).toBe(true);
  });

  test('まだ技を使っていない相手には効かない', () => {
    // Arrange
    const { engine, user, target } = makeEngine();

    // Act
    const result = engine.useMove(user, target, encore());

    // Assert
    expect(result.outcome).toBe('no-effect');
    if (result.outcome !== 'no-effect') throw new Error('unreachable');
    expect(result.reason).toBe('no-applicable-effect');
    expect(target.isEncored).toBe(false);
  });

  test('すでにアンコールされている相手には重ねて効かない', () => {
    // Arrange
    const { engine, user, target } = makeEngine();
    engine.useMove(target, user, target.moves[1]);
    engine.useMove(user, target, encore());

    // Act
    const result = engine.useMove(user, target, encore());

    // Assert
    expect(result.outcome).toBe('no-effect');
    expect(target.isEncored).toBe(true);
  });
});
