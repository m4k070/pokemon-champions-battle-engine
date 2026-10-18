import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { createStatusState } from '../src/status-state.js';
import { SeededRandom, SystemRandom, seededRandom } from '../src/rng.js';
import type { AgentDecision } from '../src/ai/battle-agent.js';

// 命中率を55%にした単一技だけを持たせ、乱数が結果に出るシナリオを作る。
// HPは十分高くして、数ターンでは決着しないようにする。
function makeProbe(name: string, accuracy = 55, pp = 30): Pokemon {
  return new Pokemon({
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 60 },
    moves: [createMove({ name: 'tackle', type: 'normal', category: 'physical', power: 30, accuracy, pp })],
  });
}

const attack = (): AgentDecision => ({ action: { type: 'move', moveIndex: 0, target: 0 } });

// 同じ seed で「2体が毎ターン攻撃する」スクリプト対戦を回し、ログを返す。
async function scriptedLog(seed: number, turns = 5): Promise<string> {
  const session = await BattleSession.start([makeProbe('A')], [makeProbe('B')], {
    rng: seededRandom(seed),
  });
  for (let i = 0; i < turns; i++) {
    session.beginTurn();
    session.applyTurn(attack(), attack());
    session.endTurn();
  }
  return session.engine.getLog();
}

describe('SeededRandom', () => {
  test('same seed produces the same sequence, different seeds diverge', () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    const c = new SeededRandom(1235);

    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(Array.from({ length: 5 }, () => c.next()));
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  test('values are spread across the 0..1 range', () => {
    const rng = new SeededRandom(7);
    const values = Array.from({ length: 1000 }, () => rng.next());
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  test('getState/setState resumes the sequence from the saved point', () => {
    const rng = new SeededRandom(42);
    rng.next();
    rng.next();
    const state = rng.getState();
    const expected = [rng.next(), rng.next(), rng.next()];

    rng.setState(state);

    expect([rng.next(), rng.next(), rng.next()]).toEqual(expected);
  });
});

describe('SystemRandom', () => {
  test('has no reproducible state', () => {
    const rng = new SystemRandom();
    expect(rng.getState()).toBeNull();
    expect(rng.next()).toBeGreaterThanOrEqual(0);
    expect(rng.next()).toBeLessThan(1);
  });
});

describe('BattleEngine with an injected random source', () => {
  test('defaults to the system random source (backwards compatible)', () => {
    expect(new BattleEngine().rng.getState()).toBeNull();
  });

  test('the same seed replays the same battle', async () => {
    expect(await scriptedLog(2026)).toBe(await scriptedLog(2026));
  });

  test('different seeds give different battles', async () => {
    const logs = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      logs.add(await scriptedLog(seed, 3));
    }
    expect(logs.size).toBeGreaterThan(1);
  });

  test('sleep duration is drawn from the injected source', () => {
    expect(createStatusState('sleep', seededRandom(5))).toEqual(createStatusState('sleep', seededRandom(5)));

    const durations = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      const state = createStatusState('sleep', seededRandom(seed));
      durations.add(state.kind === 'sleep' ? state.turnsLeft : -1);
    }
    expect(durations.size).toBeGreaterThan(1);
  });
});

describe('reproducibility across snapshot / restore / fork', () => {
  test('restoring a snapshot replays the same turn', async () => {
    const session = await BattleSession.start([makeProbe('A')], [makeProbe('B')], {
      rng: seededRandom(777),
    });
    session.beginTurn();
    const checkpoint = session.snapshot();

    session.applyTurn(attack(), attack());
    session.endTurn();
    const firstLog = session.engine.getLog();

    session.restore(checkpoint);
    session.applyTurn(attack(), attack());
    session.endTurn();

    expect(session.engine.getLog()).toBe(firstLog);
  });

  test('a forked session continues the same random sequence', async () => {
    const session = await BattleSession.start([makeProbe('A')], [makeProbe('B')], {
      rng: seededRandom(99),
    });
    session.beginTurn();
    session.applyTurn(attack(), attack());
    session.endTurn();

    const forked = session.fork();

    session.beginTurn();
    forked.beginTurn();
    session.applyTurn(attack(), attack());
    forked.applyTurn(attack(), attack());
    session.endTurn();
    forked.endTurn();

    expect(forked.engine.getLog()).toBe(session.engine.getLog());
  });
});

describe('seeded agents', () => {
  test('a seeded session with seeded agents replays identically end to end', async () => {
    const play = async () => {
      const session = await BattleSession.start([makeProbe('A')], [makeProbe('B')], {
        rng: seededRandom(2026),
      });
      const agentA = new RandomBattleAgent(seededRandom(1));
      const agentB = new RandomBattleAgent(seededRandom(2));
      while (!session.isFinished() && session.engine.turn < 10) {
        await session.playTurn(agentA, agentB);
      }
      return session.engine.getLog();
    };

    expect(await play()).toBe(await play());
  });
});
