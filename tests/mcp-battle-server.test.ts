import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBattleServer } from '../src/mcp-battle-server.js';

function attacker(name = 'Attacker') {
  return {
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 100, ATK: 100, DEF: 50, SPATK: 50, SPDEF: 50, SPEED: 100 },
    moves: [{ name: 'tackle', type: 'normal', power: 100, accuracy: 100, pp: 5, category: 'physical' }],
  };
}

function defender(name = 'Defender') {
  return {
    name,
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 1, ATK: 10, DEF: 10, SPATK: 10, SPDEF: 10, SPEED: 1 },
    moves: [{ name: 'tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' }],
  };
}

async function setup() {
  const server = createBattleServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { server, client };
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  // isError時はJSONではなくプレーンテキストのエラーメッセージが返る
  const data = result.isError ? undefined : JSON.parse(text);
  return { result, data };
}

describe('MCP battle server (client-driven actions)', () => {
  test('start_battle creates a session and returns its initial state', async () => {
    const { client } = await setup();

    const { data } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });

    expect(data.sessionId).toEqual(expect.any(String));
    expect(data.state.turn).toBe(0);
    expect(data.state.teamA[0].name).toBe('Attacker');
    expect(data.state.teamB[0].name).toBe('Defender');
    expect(data.state.isFinished).toBe(false);
  });

  test('apply_turn with client-supplied actions resolves a deterministic OHKO', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });
    const sessionId = started.sessionId;

    const { data } = await callTool(client, 'apply_turn', {
      sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });

    expect(data.turn).toBe(1);
    expect(data.isFinished).toBe(true);
    expect(data.winner).toBe(0);
    expect(data.teamB[0].isFainted).toBe(true);
  });

  test('"auto" lets the server decide with RandomBattleAgent for that side', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });

    const { data } = await callTool(client, 'apply_turn', {
      sessionId: started.sessionId,
      actionA: 'auto',
      actionB: 'auto',
    });

    expect(data.turn).toBe(1);
  });

  test('apply_turn rejects a call while a forced switch is pending', async () => {
    const { client } = await setup();
    const teamA = [defender('Fainted'), attacker('Bench')];
    const { data: started } = await callTool(client, 'start_battle', { teamA, teamB: [attacker('Opponent')] });

    // OpponentのtackleでFaintedを確実に倒す
    await callTool(client, 'apply_turn', {
      sessionId: started.sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });

    const stateAfterKO = (await callTool(client, 'get_battle_state', { sessionId: started.sessionId })).data;
    expect(stateAfterKO.needsForcedSwitchSide0).toBe(true);

    const rejected = await callTool(client, 'apply_turn', {
      sessionId: started.sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });
    expect(rejected.result.isError).toBe(true);

    const { data: switched } = await callTool(client, 'apply_forced_switch', {
      sessionId: started.sessionId,
      side: 0,
      pokemonIndex: 1,
    });
    expect(switched.needsForcedSwitchSide0).toBe(false);
    expect(switched.activeIndexA).toBe(1);
  });

  test('undo/redo revert and re-apply the last apply_turn', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });
    const sessionId = started.sessionId;

    await callTool(client, 'apply_turn', {
      sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });

    const { data: undone } = await callTool(client, 'undo', { sessionId });
    expect(undone.turn).toBe(0);
    expect(undone.teamB[0].isFainted).toBe(false);

    const { data: redone } = await callTool(client, 'redo', { sessionId });
    expect(redone.turn).toBe(1);
    expect(redone.isFinished).toBe(true);
  });

  test('fork_battle creates an independent session', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });

    const { data: forked } = await callTool(client, 'fork_battle', { sessionId: started.sessionId });
    expect(forked.sessionId).not.toBe(started.sessionId);

    await callTool(client, 'apply_turn', {
      sessionId: forked.sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });

    const original = (await callTool(client, 'get_battle_state', { sessionId: started.sessionId })).data;
    expect(original.turn).toBe(0); // forkしたセッションを進めても元は無傷
  });

  test('get_battle_log returns the mechanical log and reasoning log', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });

    await callTool(client, 'apply_turn', {
      sessionId: started.sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
      reasoningA: '確定OHKOが取れるため攻撃する',
    });

    const { data } = await callTool(client, 'get_battle_log', { sessionId: started.sessionId });
    expect(typeof data.log).toBe('string');
    expect(data.log.length).toBeGreaterThan(0);
    expect(data.reasoningLog).toContainEqual(
      expect.objectContaining({ reasoning: '確定OHKOが取れるため攻撃する' })
    );
  });

  test('unknown sessionId returns an error result instead of throwing', async () => {
    const { client } = await setup();
    const { result } = await callTool(client, 'get_battle_state', { sessionId: 'does-not-exist' });
    expect(result.isError).toBe(true);
  });

  test('pivot技はapply_turnを中断し、apply_pivot_switchでターンが再開する', async () => {
    const { client } = await setup();
    const pivoter = {
      ...attacker('Pivoter'),
      moves: [{ name: 'u-turn', type: 'bug', power: 70, accuracy: 100, pp: 10, category: 'physical', pivot: true }],
    };
    const bench = attacker('Bench');
    // pivot使用者より遅く、1発では落ちない相手にする（中断状態を観測するため）。
    const opponent = {
      ...attacker('Opponent'),
      baseStats: { HP: 200, ATK: 100, DEF: 100, SPATK: 50, SPDEF: 100, SPEED: 1 },
    };

    const { data: started } = await callTool(client, 'start_battle', { teamA: [pivoter, bench], teamB: [opponent] });
    const sessionId = started.sessionId;

    const { data: paused } = await callTool(client, 'apply_turn', {
      sessionId,
      actionA: { type: 'move', moveIndex: 0 },
      actionB: { type: 'move', moveIndex: 0 },
    });

    expect(paused.isTurnComplete).toBe(false);
    expect(paused.needsPivotSwitchSide0).toBe(true);
    expect(paused.needsPivotSwitchSide1).toBe(false);
    expect(paused.activeIndexA).toBe(0); // まだ交代していない

    const { data: resumed } = await callTool(client, 'apply_pivot_switch', {
      sessionId,
      side: 0,
      pokemonIndex: 1,
      reasoning: 'とんぼがえりで削ってから受け出しに繋ぐ',
    });

    expect(resumed.isTurnComplete).toBe(true);
    expect(resumed.needsPivotSwitchSide0).toBe(false);
    expect(resumed.activeIndexA).toBe(1);
    expect(resumed.teamA[1].currentHP).toBeLessThan(resumed.teamA[1].maxHP); // 交代後が攻撃を受けた
  });

  test('入力待ちでない側へのapply_pivot_switchはエラーになる', async () => {
    const { client } = await setup();
    const { data: started } = await callTool(client, 'start_battle', { teamA: [attacker()], teamB: [defender()] });

    const { result } = await callTool(client, 'apply_pivot_switch', {
      sessionId: started.sessionId,
      side: 0,
      pokemonIndex: 0,
    });

    expect(result.isError).toBe(true);
  });
});
