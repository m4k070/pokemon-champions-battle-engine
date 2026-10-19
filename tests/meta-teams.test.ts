import { META_TEAMS, teamToPokemons, toPokemon } from '../src/data/meta-teams.js';
import { BattleSession } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';
import { fixedRandom } from './helpers/scripted-random.js';
import { SeededRandom } from '../src/rng.js';

describe('現環境PTカタログ', () => {
  test('各構築は6体・4技・持ち物を持ち、種族値とタイプが埋まっている', () => {
    expect(META_TEAMS.length).toBeGreaterThan(0);

    for (const entry of META_TEAMS) {
      expect(entry.members).toHaveLength(6);
      expect(entry.basicSelection).not.toBe('');
      expect(entry.alternativeSelections.length).toBeGreaterThan(0);

      for (const member of entry.members) {
        expect(member.moves).toHaveLength(4);
        expect(member.baseStats.HP).toBeGreaterThan(0);
        expect(member.types.length).toBeGreaterThan(0);
        expect(member.name).not.toBe('');
      }
    }
  });

  test('実数値が構築記事の値と一致する（カバルドン H215 A132 B187 C79 D94 S67）', () => {
    const entry = META_TEAMS[0];
    const hippowdon = toPokemon(entry.members.find((m) => m.name === 'hippowdon')!);

    expect(hippowdon.stats).toEqual({
      HP: 215, ATK: 132, DEF: 187, SPATK: 79, SPDEF: 94, SPEED: 67,
    });
  });

  test('メガガブリアスZ にメガシンカすると ドラゴン単・ふゆう・C193/S223 になる', () => {
    const entry = META_TEAMS[0];
    const garchomp = toPokemon(entry.members.find((m) => m.name === 'garchomp')!);
    expect(garchomp.item).toBe('garchompite-z');
    expect(garchomp.stats).toEqual({
      HP: 185, ATK: 135, DEF: 115, SPATK: 132, SPDEF: 105, SPEED: 169,
    });

    new MegaEvolutionSystem().megaEvolve(garchomp);

    expect(garchomp.types).toEqual(['dragon']);
    expect(garchomp.ability).toBe('levitate');
    expect(garchomp.stats).toEqual({
      HP: 185, ATK: 135, DEF: 105, SPATK: 193, SPDEF: 105, SPEED: 223,
    });
  });

  test('カタログの構築で1試合を最後まで走らせて勝敗とログが取れる', async () => {
    const entry = META_TEAMS[0];
    const teamA = teamToPokemons(entry);
    const teamB = teamToPokemons(entry);
    const session = await BattleSession.start(teamA, teamB, { rng: new SeededRandom(2026) });
    const agent = new RandomBattleAgent(fixedRandom(0.5));

    let turns = 0;
    while (!session.isFinished() && turns < 300) {
      await session.playTurn(agent, agent);
      turns++;
    }

    expect(session.isFinished()).toBe(true);
    expect(session.winner()).not.toBeNull();
    expect(session.engine.getLog().length).toBeGreaterThan(0);
    // 6体×2の構築なので、1ターンで終わることはない
    expect(turns).toBeGreaterThan(1);
  });
});
