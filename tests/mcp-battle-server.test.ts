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
});
