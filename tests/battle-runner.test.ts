import { BattleSession, BattleHistory, runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';

// 素早いAttacker(単一技・確定OHKO)とのろまなDefenderで、
// 「先攻が必ず勝つ」決定論的なシナリオを作る（Randomでも選択肢が1つしかないため揺れない）。
function makeAttacker(name = 'Attacker'): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 100 },
    moves: [new Move({ name: 'tackle', type: 'normal', power: 100, accuracy: 100, pp: 5, category: 'physical' })],
  });
}

function makeDefender(name = 'Defender'): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 1, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 1 },
    moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
  });
}

describe('BattleSession', () => {
  test('start() puts each lead active and applies the initial switch-in', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);

    expect(session.activeA).toBe(teamA[0]);
    expect(session.activeB).toBe(teamB[0]);
  });

  test('playTurn resolves a deterministic OHKO and marks the session finished', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);
    const random = new RandomBattleAgent();

    await session.playTurn(random, random);

    expect(session.isFinished()).toBe(true);
    expect(session.winner()).toBe(0);
    expect(session.engine.turn).toBe(1);
    expect(session.reasoningLog.length).toBeGreaterThan(0);
  });

  test('needsForcedSwitch is true only while the active Pokemon is fainted and the team is not wiped', async () => {
    const fainted = makeAttacker('Fainted');
    fainted.currentHP = 0;
    const bench = makeAttacker('Bench');
    const teamA = [fainted, bench];
    const teamB = [makeDefender()];

    const session = await BattleSession.start(teamA, teamB, { leadA: fainted });

    expect(session.needsForcedSwitch(0)).toBe(true);

    // 瀕死のポケモンはgetLegalActionsで技が除外されるため、RandomBattleAgentも交代しか選べない
    const decision = await new RandomBattleAgent().selectAction(session.getContext(0));
    expect(decision.action.type).toBe('switch');

    session.applyForcedSwitch(0, { action: { type: 'switch', pokemonIndex: 1 } });

    expect(session.activeA).toBe(bench);
    expect(session.needsForcedSwitch(0)).toBe(false);
    expect(session.reasoningLog).toContainEqual(
      expect.objectContaining({ side: 0, pokemonName: 'Fainted' })
    );
  });

  test('applyForcedSwitch rejects a non-switch decision', async () => {
    const fainted = makeAttacker('Fainted');
    fainted.currentHP = 0;
    const teamA = [fainted, makeAttacker('Bench')];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB, { leadA: fainted });

    expect(() => session.applyForcedSwitch(0, { action: { type: 'forfeit' } })).toThrow('switch以外の行動');
  });

  test('start() lets the slower lead\'s weather-setting ability overwrite the faster one\'s', async () => {
    // teamA(ひでり)の方がteamB(あめふらし)より速いので、実際の対戦仕様では
    // 後から発動する遅い側(teamB)のあめふらしが最終的な天候として残るはず。
    const fastDrought = new Pokemon({
      name: 'FastDrought',
      types: ['fire'],
      ability: 'drought',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 150 },
    });
    const slowDrizzle = new Pokemon({
      name: 'SlowDrizzle',
      types: ['water'],
      ability: 'drizzle',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 50 },
    });

    const session = await BattleSession.start([fastDrought], [slowDrizzle]);

    expect(session.engine.weather).toBe('rain');
  });

  test('applyTurn throws if beginTurn() was not called first', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);

    expect(() =>
      session.applyTurn(
        { action: { type: 'move', moveIndex: 0, target: 0 } },
        { action: { type: 'move', moveIndex: 0, target: 0 } }
      )
    ).toThrow('beginTurn()');
  });
});

describe('snapshot / restore / fork', () => {
  test('snapshot + restore round-trips the exact battle state', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender(), makeDefender('Defender2')];
    const session = await BattleSession.start(teamA, teamB);

    const before = session.snapshot();
    session.teamB[0].currentHP = 1; // このセッションだけを直接壊す

    session.restore(before);

    expect(session.teamB[0].currentHP).toBe(session.teamB[0].maxHP);
  });

  test('fork() creates an independent branch that does not affect the original', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);

    const forked = session.fork();
    forked.teamA[0].currentHP = 1;
    forked.engine.weather = 'sand';

    expect(session.teamA[0].currentHP).toBe(session.teamA[0].maxHP);
    expect(session.engine.weather).toBeNull();
  });
});

describe('BattleHistory', () => {
  test('undo reverts the last playTurn, redo re-applies it', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);
    const history = new BattleHistory(session);
    const random = new RandomBattleAgent();

    expect(history.canUndo()).toBe(false);

    await history.playTurn(random, random);
    expect(session.isFinished()).toBe(true);
    expect(session.engine.turn).toBe(1);

    history.undo();
    expect(session.isFinished()).toBe(false);
    expect(session.engine.turn).toBe(0);
    expect(session.teamB[0].currentHP).toBe(session.teamB[0].maxHP);

    history.redo();
    expect(session.isFinished()).toBe(true);
    expect(session.engine.turn).toBe(1);
  });

  test('undo/redo throw when there is no history to move to', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);
    const history = new BattleHistory(session);

    expect(() => history.undo()).toThrow('undoできる履歴がありません');
    expect(() => history.redo()).toThrow('redoできる履歴がありません');
  });

  test('fork() on BattleHistory branches without sharing session state', async () => {
    const teamA = [makeAttacker()];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB);
    const history = new BattleHistory(session);

    const branch = history.fork();
    branch.session.teamA[0].currentHP = 1;

    expect(session.teamA[0].currentHP).toBe(session.teamA[0].maxHP);
  });
});

describe('runBattle', () => {
  test('finishes quickly with a deterministic winner', async () => {
    const random = new RandomBattleAgent();
    const result = await runBattle([makeAttacker()], [makeDefender()], random, random);

    expect(result.winner).toBe(0);
    expect(result.turns).toBeLessThanOrEqual(2);
  });

  test('returns a null winner when maxTurns is reached without a KO', async () => {
    const harmless = () =>
      new Pokemon({
        name: 'Harmless',
        types: ['normal'],
        ability: 'none',
        item: null,
        baseStats: { HP: 200, ATK: 1, DEF: 200, SPATK: 1, SPDEF: 200, SPEED: 50 },
        moves: [new Move({ name: 'splash', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' })],
      });
    const random = new RandomBattleAgent();

    const result = await runBattle([harmless()], [harmless()], random, random, { maxTurns: 3 });

    expect(result.winner).toBeNull();
    expect(result.turns).toBe(3);
  });
});
