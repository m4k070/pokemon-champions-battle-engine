import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { extractFeatures } from '../src/ai/features.js';
import type { BattleAgent, BattleContext } from '../src/ai/battle-agent.js';
import type { AgentAction } from '../src/types.js';

// fork / snapshot → restore で失われていた状態（1手先読みが学習時と違う局面を評価していた原因）を固定する。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const tackle = () => createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 30, category: 'physical' });
const yawn = () => createMove({ name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', inflictsDrowsy: true });

class Fixed implements BattleAgent {
  constructor(private readonly action: AgentAction) {}
  async selectLead(team: Pokemon[]) {
    return team[0]!;
  }
  async selectAction(_context: BattleContext) {
    return { action: this.action };
  }
}

function team(name: string, item: Pokemon['item'] = 'leftovers'): Pokemon[] {
  return [
    new Pokemon({ name, types: ['normal'], ability: 'none', item, baseStats: stats, moves: [yawn(), tackle()] }),
    new Pokemon({ name: `${name}-2`, types: ['normal'], ability: 'none', item: null, baseStats: stats, moves: [tackle()] }),
  ];
}

async function played(): Promise<BattleSession> {
  const session = await BattleSession.start(team('mon-a'), team('mon-b'), { rng: new SeededRandom(4), information: 'partial' });
  session.engine.field.terrain = 'grassy-terrain';
  session.engine.field.terrainTurnsLeft = 4;
  await session.playTurn(new Fixed({ type: 'move', moveIndex: 0, target: 0 }), new Fixed({ type: 'move', moveIndex: 1, target: 0 }));
  return session;
}

describe('fork で状態を保つ', () => {
  test('相手に見えた技・フィールド・あくびの眠気を引き継ぎ、特徴量が一致する', async () => {
    const session = await played();
    const fork = session.fork();
    expect(fork.getContext(1).opponent.moves.map((move) => move.name)).toEqual(['あくび']);
    expect(fork.engine.field.terrain).toBe('grassy-terrain');
    expect(fork.activeB.drowsyUntilTurn).toBe(session.activeB.drowsyUntilTurn);
    expect(session.activeB.drowsyUntilTurn).not.toBeNull();
    for (const side of [0, 1] as const) {
      expect(extractFeatures(fork.getContext(side))).toEqual(extractFeatures(session.getContext(side)));
    }
  });

  test('メガシンカの使用済みを引き継ぐ', async () => {
    const session = await played();
    (session as unknown as { megaUsed: [boolean, boolean] }).megaUsed = [true, false];
    const fork = session.fork();
    expect((fork as unknown as { megaUsed: [boolean, boolean] }).megaUsed).toEqual([true, false]);
  });

  test('古いスナップショット（追加項目なし）も読める', async () => {
    const session = await played();
    const snapshot = session.snapshot();
    delete snapshot.session!.known;
    delete snapshot.session!.megaUsed;
    delete snapshot.field.terrain;
    delete snapshot.moveLog;
    const restored = BattleSession.fromSnapshot(snapshot, undefined, 'partial');
    expect(restored.engine.field.terrain).toBeNull();
    expect(restored.getContext(1).opponent.moves).toHaveLength(0);
  });
});
