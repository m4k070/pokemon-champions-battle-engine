import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import type { BattleContext } from '../src/ai/battle-agent.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';

function makePokemon(overrides: { moves?: Move[]; item?: string | null } = {}): Pokemon {
  return new Pokemon({
    name: 'Garchomp',
    types: ['dragon', 'ground'],
    ability: 'rough-skin',
    item: overrides.item ?? null,
    baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
    moves: overrides.moves ?? [
      new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 }),
      new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10 }),
    ],
  });
}

function makeContext(overrides: Partial<BattleContext> = {}): BattleContext {
  const self = overrides.self ?? makePokemon();
  return {
    turn: 1,
    self,
    selfTeam: overrides.selfTeam ?? [self],
    opponent: overrides.opponent ?? makePokemon(),
    opponentTeam: overrides.opponentTeam ?? [overrides.opponent ?? makePokemon()],
    canMegaEvolve: overrides.canMegaEvolve ?? false,
    field: overrides.field ?? {
      weather: null,
      weatherTurnsLeft: 0,
      trickRoom: false,
      trickRoomTurnsLeft: 0,
      stealthRock: { self: false, opponent: false },
    },
    recentLog: overrides.recentLog ?? [],
  };
}

describe('RandomBattleAgent', () => {
  test('selectLead returns the first team member', async () => {
    const agent = new RandomBattleAgent();
    const lead = makePokemon();
    const bench = makePokemon();

    const selected = await agent.selectLead([lead, bench]);

    expect(selected).toBe(lead);
  });

  test('only picks moves with remaining PP', async () => {
    const agent = new RandomBattleAgent();
    const self = makePokemon({
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 }),
        new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 5 }),
      ],
    });

    const decision = await agent.selectAction(makeContext({ self, selfTeam: [self] }));

    expect(decision.action).toEqual({ type: 'move', moveIndex: 1, target: 0 });
  });

  test('switches to a healthy teammate when every move is out of PP', async () => {
    const agent = new RandomBattleAgent();
    const self = makePokemon({
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 }),
        new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 0 }),
      ],
    });
    const bench = makePokemon();

    const decision = await agent.selectAction(makeContext({ self, selfTeam: [self, bench] }));

    expect(decision.action).toEqual({ type: 'switch', pokemonIndex: 1 });
  });

  test('forfeits when out of PP and no healthy teammate remains', async () => {
    const agent = new RandomBattleAgent();
    const self = makePokemon({
      moves: [new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 0 })],
    });

    const decision = await agent.selectAction(makeContext({ self, selfTeam: [self] }));

    expect(decision.action).toEqual({ type: 'forfeit' });
  });

  test('respects a choice-item move lock', async () => {
    const agent = new RandomBattleAgent();
    const self = makePokemon({
      item: 'choice-scarf',
      moves: [
        new Move({ name: 'earthquake', type: 'ground', power: 100, accuracy: 100, pp: 10 }),
        new Move({ name: 'outrage', type: 'dragon', power: 120, accuracy: 100, pp: 10 }),
      ],
    });
    self.lockMove(0);

    const decision = await agent.selectAction(makeContext({ self, selfTeam: [self] }));

    expect(decision.action).toEqual({ type: 'move', moveIndex: 0, target: 0 });
  });

  test('declares megaEvolve on its move when mega evolution is available', async () => {
    const agent = new RandomBattleAgent();
    const self = makePokemon();

    const decision = await agent.selectAction(makeContext({ self, selfTeam: [self], canMegaEvolve: true }));

    expect(decision.action.type).toBe('move');
    expect((decision.action as { megaEvolve?: boolean }).megaEvolve).toBe(true);
  });
});
