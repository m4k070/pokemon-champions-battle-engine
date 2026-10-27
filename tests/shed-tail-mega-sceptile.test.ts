import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';
import type { BattleAgent } from '../src/ai/battle-agent.js';

// しっぽきり（身代わりを出して交代し、交代先が引き継ぐ）と、メガジュカイン（ジュカインナイト）を固定する。

const baseStats = { HP: 100, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };
const shedTail = () => createMove({ name: 'しっぽきり', type: 'normal', power: 0, accuracy: 100, pp: 10, category: 'status', pivot: true, shedTail: true });
const splash = () => createMove({ name: 'はねる', type: 'normal', power: 0, accuracy: 100, pp: 40, category: 'status' });
const mon = (name: string, moves = [splash()]) =>
  new Pokemon({ name, types: ['normal'], ability: 'none', item: null, baseStats: { ...baseStats }, moves });

// 技0を撃ち、pivot の交代先は控えの先頭。
const agent: BattleAgent = {
  selectLead: async (team) => team[0]!,
  selectAction: async (context) => context.mustSwitch
    ? { action: { type: 'switch', pokemonIndex: context.selfTeam.findIndex((p) => p !== context.self && !p.isFainted) } }
    : { action: { type: 'move', moveIndex: 0, target: 0 } },
};

describe('しっぽきり', () => {
  test('HPを半分払って身代わり（最大HPの1/4）を出し、交代先が身代わりを引き継ぐ', async () => {
    const user = mon('user', [shedTail()]);
    const bench = mon('bench');
    const session = await BattleSession.start([user, bench], [mon('opp')], { rng: new SeededRandom(1) });
    await session.playTurn(agent, agent);
    expect(user.currentHP).toBe(user.maxHP - Math.ceil(user.maxHP / 2));
    expect(user.substituteHP).toBe(0);
    expect(session.activeA).toBe(bench);
    expect(bench.substituteHP).toBe(Math.floor(user.maxHP / 4));
  });

  test('HPが半分以下なら失敗し、交代もしない', async () => {
    const user = mon('user', [shedTail()]);
    user.currentHP = Math.ceil(user.maxHP / 2);
    const session = await BattleSession.start([user, mon('bench')], [mon('opp')], { rng: new SeededRandom(1) });
    await session.playTurn(agent, agent);
    expect(session.activeA).toBe(user);
    expect(user.substituteHP).toBe(0);
    expect(user.currentHP).toBe(Math.ceil(user.maxHP / 2));
  });

  test('控えがいなければ失敗する', async () => {
    const user = mon('user', [shedTail()]);
    const session = await BattleSession.start([user], [mon('opp')], { rng: new SeededRandom(1) });
    await session.playTurn(agent, agent);
    expect(user.currentHP).toBe(user.maxHP);
    expect(user.substituteHP).toBe(0);
  });
});

test('ジュカインナイトでメガジュカイン（くさ/ドラゴン・ひらいしん・+100）になる', () => {
  const sceptile = new Pokemon({
    name: 'sceptile', types: ['grass'], ability: 'overgrow', item: 'sceptilite',
    baseStats: { HP: 70, ATK: 85, DEF: 65, SPATK: 105, SPDEF: 85, SPEED: 120 }, moves: [splash()],
  });
  const system = new MegaEvolutionSystem();
  expect(system.canMegaEvolve(sceptile)).toBe(true);
  system.megaEvolve(sceptile);
  expect(sceptile.name).toBe('mega-sceptile');
  expect(sceptile.types).toEqual(['grass', 'dragon']);
  expect(sceptile.ability).toBe('lightning-rod');
  expect(sceptile.baseStats).toEqual({ HP: 70, ATK: 110, DEF: 75, SPATK: 145, SPDEF: 85, SPEED: 145 });
});
