import { BattleSession, BattleHistory, runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent, getLegalActions } from '../src/ai/battle-agent.js';
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

  test('switching out resets the toxic counter but leaves the badly-poisoned status intact', async () => {
    const poisoned = makeAttacker('Poisoned');
    poisoned.status = 'badly-poisoned';
    poisoned.toxicCounter = 7;
    const bench = makeAttacker('Bench');
    const teamA = [poisoned, bench];
    const teamB = [makeDefender()];

    const session = await BattleSession.start(teamA, teamB, { leadA: poisoned });
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'switch', pokemonIndex: 1 } },
      { action: { type: 'forfeit' } }
    );

    expect(poisoned.status).toBe('badly-poisoned'); // 交代しても状態異常自体は治らない
    expect(poisoned.toxicCounter).toBe(0); // ただし経過ターン数はリセットされる
  });

  test('switching out cures the volatile Leech Seed status (unlike major status conditions)', async () => {
    const seeded = makeAttacker('Seeded');
    seeded.isSeeded = true;
    const bench = makeAttacker('Bench');
    const teamA = [seeded, bench];
    const teamB = [makeDefender()];

    const session = await BattleSession.start(teamA, teamB, { leadA: seeded });
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'switch', pokemonIndex: 1 } },
      { action: { type: 'forfeit' } }
    );

    expect(seeded.isSeeded).toBe(false);
  });

  test('applyForcedSwitch rejects a non-switch decision', async () => {
    const fainted = makeAttacker('Fainted');
    fainted.currentHP = 0;
    const teamA = [fainted, makeAttacker('Bench')];
    const teamB = [makeDefender()];
    const session = await BattleSession.start(teamA, teamB, { leadA: fainted });

    expect(() => session.applyForcedSwitch(0, { action: { type: 'forfeit' } })).toThrow('switch以外の行動');
  });

  test('a move action with megaEvolve:true mega evolves the caster before speed is compared', async () => {
    const charizard = new Pokemon({
      name: 'Charizard',
      baseName: 'charizard',
      types: ['fire', 'flying'],
      ability: 'blaze',
      item: 'charizardite-y',
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
    });
    const defender = makeDefender();
    const session = await BattleSession.start([charizard], [defender]);
    session.beginTurn();

    expect(session.megaEvolutionSystem.canMegaEvolve(charizard)).toBe(true);

    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0, megaEvolve: true } },
      { action: { type: 'forfeit' } }
    );

    expect(charizard.isMega).toBe(true);
    expect(charizard.name).toBe('mega-charizard-y');
    expect(charizard.ability).toBe('drought');
    expect(session.megaEvolutionSystem.canMegaEvolve(charizard)).toBe(false); // 一度メガシンカしたら戻せない
  });

  test('mega evolution triggers the new ability\'s onSwitchIn (drought sets sun)', async () => {
    // メガシンカは実質的な場への再登場: 新特性（ひでり）の onSwitchIn が発動する
    const charizard = new Pokemon({
      name: 'Charizard',
      baseName: 'charizard',
      types: ['fire', 'flying'],
      ability: 'blaze',
      item: 'charizardite-y',
      baseStats: { HP: 78, ATK: 84, DEF: 78, SPATK: 109, SPDEF: 85, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
    });
    const defender = makeDefender();
    const session = await BattleSession.start([charizard], [defender]);
    session.beginTurn();

    expect(session.engine.weather).toBeNull(); // メガシンカ前は天候なし

    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0, megaEvolve: true } },
      { action: { type: 'forfeit' } }
    );

    expect(charizard.isMega).toBe(true);
    expect(charizard.ability).toBe('drought');
    expect(session.engine.weather).toBe('sun'); // メガシンカでひでりが発動した
    expect(session.engine.weatherTurnsLeft).toBe(5);
  });

  test('mega evolution triggers electric surge (electric terrain set on switch-in)', async () => {
    // ライチュウXのメガシンカでエレキメイカーが発動し、エレキフィールドが展開される
    const raichu = new Pokemon({
      name: 'Raichu',
      baseName: 'raichu',
      types: ['electric'],
      ability: 'static',
      item: 'raichunite-x',
      baseStats: { HP: 60, ATK: 90, DEF: 55, SPATK: 90, SPDEF: 80, SPEED: 110 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
    });
    const defender = makeDefender();
    const session = await BattleSession.start([raichu], [defender]);
    session.beginTurn();

    expect(session.engine.field.terrain).toBeNull();

    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0, megaEvolve: true } },
      { action: { type: 'forfeit' } }
    );

    expect(raichu.isMega).toBe(true);
    expect(raichu.ability).toBe('electric-surge');
    expect(session.engine.field.terrain).toBe('electric-terrain'); // メガシンカでエレキフィールド展開
    expect(session.engine.field.terrainTurnsLeft).toBe(5);
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

describe('こだわり系の技固定', () => {
  function makeChooser(item: string | null): Pokemon {
    return new Pokemon({
      name: 'Chooser',
      types: ['normal'],
      ability: 'none',
      item,
      baseStats: { HP: 100, ATK: 100, DEF: 80, SPATK: 80, SPDEF: 80, SPEED: 100 },
      moves: [
        new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' }),
        new Move({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, pp: 10, category: 'physical' }),
      ],
    });
  }

  function makeTank(name = 'Tank'): Pokemon {
    return new Pokemon({
      name,
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 255, ATK: 10, DEF: 200, SPATK: 10, SPDEF: 200, SPEED: 1 },
      moves: [new Move({ name: 'splash', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status' })],
    });
  }

  test('こだわり系を持っていると使った技に固定され、合法手がその技だけになる', async () => {
    const chooser = makeChooser('choice-band');
    const teamA = [chooser, makeTank('BenchA')];
    const teamB = [makeTank()];
    const session = await BattleSession.start(teamA, teamB);

    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 1, target: 0 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    session.endTurn();

    expect(chooser.lockedMove).toBe(1);
    expect(getLegalActions(session.getContext(0)).moves.map((m) => m.index)).toEqual([1]);
  });

  test('こだわり系を持っていなければ技は固定されない', async () => {
    const chooser = makeChooser(null);
    const teamA = [chooser, makeTank('BenchA')];
    const teamB = [makeTank()];
    const session = await BattleSession.start(teamA, teamB);

    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 1, target: 0 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    session.endTurn();

    expect(chooser.lockedMove).toBeNull();
    expect(getLegalActions(session.getContext(0)).moves).toHaveLength(2);
  });

  test('交代で場を離れると技固定は解除される', async () => {
    const chooser = makeChooser('choice-band');
    const teamA = [chooser, makeTank('BenchA')];
    const teamB = [makeTank()];
    const session = await BattleSession.start(teamA, teamB);

    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 1, target: 0 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    session.endTurn();
    expect(chooser.lockedMove).toBe(1);

    session.beginTurn();
    session.applyTurn(
      { action: { type: 'switch', pokemonIndex: 1 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    session.endTurn();

    expect(chooser.lockedMove).toBeNull();
  });
});


describe('pivot技による攻撃後の交代', () => {
  function makePivoter(): Pokemon {
    return new Pokemon({
      name: 'Pivoter',
      types: ['bug'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 60, DEF: 80, SPATK: 50, SPDEF: 80, SPEED: 200 },
      moves: [new Move({ name: 'u-turn', type: 'bug', power: 70, accuracy: 100, pp: 10, category: 'physical', pivot: true })],
    });
  }

  function makeBench(name = 'Bench'): Pokemon {
    return new Pokemon({
      name,
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 150, ATK: 60, DEF: 80, SPATK: 50, SPDEF: 80, SPEED: 50 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
    });
  }

  function makeSlowAttacker(): Pokemon {
    return new Pokemon({
      name: 'SlowAttacker',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 200, ATK: 120, DEF: 100, SPATK: 50, SPDEF: 100, SPEED: 1 },
      moves: [new Move({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, pp: 10, category: 'physical' })],
    });
  }

  const moveAction = { action: { type: 'move', moveIndex: 0, target: 0 } } as const;

  test('pivot技が成立するとターンが中断し、交代先の入力待ちになる', async () => {
    const session = await BattleSession.start([makePivoter(), makeBench()], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(session.isTurnComplete()).toBe(false);
    expect(session.pendingPivotSide()).toBe(0);
    expect(session.needsPivotSwitch(0)).toBe(true);
    expect(session.needsPivotSwitch(1)).toBe(false);
  });

  test('中断中は技の結果を見てから交代先を選べる（相手はまだ行動していない）', async () => {
    const teamB = [makeSlowAttacker()];
    const session = await BattleSession.start([makePivoter(), makeBench()], teamB);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    // pivot使用者の技は解決済みだが、遅い相手はまだ動いていない。
    expect(teamB[0].currentHP).toBeLessThan(teamB[0].maxHP);
    expect(session.activeA.currentHP).toBe(session.activeA.maxHP);
  });

  test('中断中は技を選べず、交代先だけが合法手になる', async () => {
    const session = await BattleSession.start([makePivoter(), makeBench()], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    const context = session.getContext(0);
    expect(context.mustSwitch).toBe(true);
    expect(getLegalActions(context).moves).toHaveLength(0);
    expect(getLegalActions(context).switches.map((s) => s.index)).toEqual([1]);
  });

  test('applyPivotSwitchで交代してターンが再開し、相手の攻撃は交代後が受ける', async () => {
    const pivoter = makePivoter();
    const bench = makeBench();
    const session = await BattleSession.start([pivoter, bench], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);
    session.applyPivotSwitch(0, { action: { type: 'switch', pokemonIndex: 1 } });

    expect(session.isTurnComplete()).toBe(true);
    expect(session.activeA).toBe(bench);
    expect(bench.currentHP).toBeLessThan(bench.maxHP);
    expect(pivoter.currentHP).toBe(pivoter.maxHP);

    session.endTurn();
  });

  test('控えが全員瀕死なら中断せずその場に留まる', async () => {
    const pivoter = makePivoter();
    const bench = makeBench();
    bench.currentHP = 0;
    const session = await BattleSession.start([pivoter, bench], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(session.isTurnComplete()).toBe(true);
    expect(session.activeA).toBe(pivoter);
    expect(pivoter.currentHP).toBeLessThan(pivoter.maxHP);
  });

  test('pivot技で相手を全滅させた場合は中断しない', async () => {
    const frail = makeSlowAttacker();
    frail.currentHP = 1;
    const session = await BattleSession.start([makePivoter(), makeBench()], [frail]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(session.isTurnComplete()).toBe(true);
    expect(session.isFinished()).toBe(true);
  });

  test('両者がpivot技を使うと1ターンに2回中断する', async () => {
    const slowPivoter = makePivoter();
    slowPivoter.stats.SPEED = 1;
    const benchA = makeBench('BenchA');
    const benchB = makeBench('BenchB');
    const session = await BattleSession.start([makePivoter(), benchA], [slowPivoter, benchB]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(session.pendingPivotSide()).toBe(0);
    session.applyPivotSwitch(0, { action: { type: 'switch', pokemonIndex: 1 } });

    expect(session.pendingPivotSide()).toBe(1);
    session.applyPivotSwitch(1, { action: { type: 'switch', pokemonIndex: 1 } });

    expect(session.isTurnComplete()).toBe(true);
    expect(session.activeA).toBe(benchA);
    expect(session.activeB).toBe(benchB);
  });

  test('pivot交代でも能力ランク・こだわり固定はリセットされる', async () => {
    const pivoter = makePivoter();
    pivoter.item = 'choice-band';
    const bench = makeBench();
    const session = await BattleSession.start([pivoter, bench], [makeSlowAttacker()]);

    pivoter.modifyStatStage('ATK', 2);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);
    session.applyPivotSwitch(0, { action: { type: 'switch', pokemonIndex: 1 } });

    expect(session.activeA).toBe(bench);
    expect(pivoter.statStages.ATK).toBe(0);
    expect(pivoter.lockedMove).toBeNull();
  });

  test('中断中にendTurnを呼ぶとエラーになる', async () => {
    const session = await BattleSession.start([makePivoter(), makeBench()], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(() => session.endTurn()).toThrow('技フェーズが完了していません');
  });

  test('入力待ちでない側にapplyPivotSwitchを呼ぶとエラーになる', async () => {
    const session = await BattleSession.start([makePivoter(), makeBench()], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    expect(() => session.applyPivotSwitch(1, { action: { type: 'switch', pokemonIndex: 0 } })).toThrow();
  });

  test('中断状態はsnapshot/restoreで保存・復元される', async () => {
    const session = await BattleSession.start([makePivoter(), makeBench()], [makeSlowAttacker()]);

    session.beginTurn();
    session.applyTurn(moveAction, moveAction);

    const snapshot = structuredClone(session.snapshot());
    expect(snapshot.session?.pendingTurn?.awaitingPivotSide).toBe(0);

    const restored = BattleSession.fromSnapshot(snapshot);
    expect(restored.needsPivotSwitch(0)).toBe(true);

    // 復元したセッションでもそのまま続きを進められる。
    restored.applyPivotSwitch(0, { action: { type: 'switch', pokemonIndex: 1 } });
    expect(restored.isTurnComplete()).toBe(true);
    expect(restored.activeA.name).toBe('Bench');
    restored.endTurn();
  });

  test('playTurnはpivotの中断をエージェントに委ねて自動で解決する', async () => {
    const teamA = [makePivoter(), makeBench()];
    const session = await BattleSession.start(teamA, [makeSlowAttacker()]);
    const random = new RandomBattleAgent();

    await session.playTurn(random, random);

    expect(session.isTurnComplete()).toBe(true);
    expect(session.activeA).toBe(teamA[1]);
  });

  test('かげふみ: 相手の通常交代を阻止する', async () => {
    const shadowTag = new Pokemon({
      name: 'ShadowTag',
      types: ['ghost'],
      ability: 'shadow-tag',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const bench = new Pokemon({
      name: 'Bench',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const opponent = makeAttacker('Opponent');
    const teamA = [shadowTag, bench];
    const teamB = [opponent];
    const session = await BattleSession.start(teamA, teamB);

    session.beginTurn();
    // side=1 が交代を試みるが、side=0 の shadow-tag に阻まれて交代できない。
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0 } },
      { action: { type: 'switch', pokemonIndex: 0 } }, // 自分自身への交代は通常なら弾かれるが、チームに1体しかいないため対象外
    );
    expect(session.activeB).toBe(opponent); // 交代できていない
  });

  test('かげふみ: ゴーストタイプは交代できる', async () => {
    const shadowTag = new Pokemon({
      name: 'ShadowTag',
      types: ['ghost'],
      ability: 'shadow-tag',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const ghostBench = new Pokemon({
      name: 'GhostBench',
      types: ['ghost'],
      ability: 'none',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const opponent = makeAttacker('Opponent');
    const session = await BattleSession.start([shadowTag], [opponent, ghostBench]);

    session.beginTurn();
    // side=1 がゴーストタイプの ghostBench に交代する。かげふみはゴーストに効かないので成功する。
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0 } },
      { action: { type: 'switch', pokemonIndex: 1 } },
    );
    expect(session.activeB).toBe(ghostBench); // 交代できている
  });

  test('かげふみ: きれいなぬけがら持ちは交代できる', async () => {
    const shadowTag = new Pokemon({
      name: 'ShadowTag',
      types: ['ghost'],
      ability: 'shadow-tag',
      item: null,
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const shedShell = new Pokemon({
      name: 'ShedShell',
      types: ['normal'],
      ability: 'none',
      item: 'shed-shell',
      baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
      moves: [new Move({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
    });
    const opponent = makeAttacker('Opponent');
    const session = await BattleSession.start([shadowTag], [opponent, shedShell]);

    session.beginTurn();
    // side=1 がきれいなぬけがら持ちの shedShell に交代する。交代阻止を無視して成功する。
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0 } },
      { action: { type: 'switch', pokemonIndex: 1 } },
    );
    expect(session.activeB).toBe(shedShell); // 交代できている
  });
});
