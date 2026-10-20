import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { META_TEAMS, teamToPokemons } from '../src/data/meta-teams.js';
import { selectTeam, resolveBasicSelection, selectTeamWithPlan } from '../src/ai/team-selection.js';
import { runBattle } from '../src/battle-runner.js';
import { RandomBattleAgent } from '../src/ai/battle-agent.js';
import { SeededRandom } from '../src/rng.js';
import type { AbilityName } from '../src/ability-names.js';
import type { ItemName } from '../src/item-names.js';
import type { TypeName } from '../src/types.js';

// 選出（シングル3体）の検証。
//   1. 6体から3体を選び、順序が選出順になる
//   2. 場を整える役が初手、メガ枠が入る
//   3. 同じチームなら常に同じ選出（再現性）

function makePokemon(params: {
  name: string;
  types?: TypeName[];
  ability?: AbilityName;
  item?: ItemName | null;
  moves?: string[];
}): Pokemon {
  const moves = (params.moves ?? ['たいあたり']).map((name) => createMove({
    name, type: 'normal', power: name === 'つるぎのまい' ? 0 : 60, accuracy: 100, pp: 20,
    category: name === 'つるぎのまい' ? 'status' : 'physical',
    ...(name === 'つるぎのまい' ? { selfStatChange: [{ stat: 'ATK', delta: 2 }] } : {}),
  } as never));
  return new Pokemon({
    name: params.name,
    types: params.types ?? ['normal'],
    ability: params.ability ?? 'none',
    item: params.item ?? null,
    baseStats: { HP: 150, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 },
    moves,
  });
}

describe('選出ロジック', () => {
  test('6体から3体を選び、順序が選出順になる', () => {
    const team = [
      makePokemon({ name: 'A' }), makePokemon({ name: 'B' }), makePokemon({ name: 'C' }),
      makePokemon({ name: 'D' }), makePokemon({ name: 'E' }), makePokemon({ name: 'F' }),
    ];
    const selection = selectTeam(team);
    expect(selection.members).toHaveLength(3);
    expect(new Set(selection.members).size).toBe(3);
  });

  test('始動役が初手、メガ枠が2番手に入る', () => {
    const team = [
      makePokemon({ name: 'Wall' }),
      makePokemon({ name: 'Mega', item: 'swampertite' }),
      makePokemon({ name: 'Setter', ability: 'drizzle' }),
      makePokemon({ name: 'Filler1' }),
      makePokemon({ name: 'Filler2' }),
      makePokemon({ name: 'Filler3' }),
    ];
    const selection = selectTeam(team);
    expect(selection.members[0]!.name).toBe('Setter');
    expect(selection.members[1]!.name).toBe('Mega');
  });

  test('同じチームなら常に同じ選出（乱数を使わない）', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガカメックス構築')!;
    const first = selectTeam(teamToPokemons(entry)).members.map((pokemon) => pokemon.name);
    const second = selectTeam(teamToPokemons(entry)).members.map((pokemon) => pokemon.name);
    expect(first).toEqual(second);
  });

  test('メガカメックス構築はイエッサン初手・メガカメックスを含む', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガカメックス構築')!;
    const names = selectTeam(teamToPokemons(entry)).members.map((pokemon) => pokemon.name);
    expect(names[0]).toBe('indeedee-male');
    expect(names).toContain('blastoise');
  });

describe('基本選出テキストの解決', () => {
  test('イエッサン初手／オオニューラ／メガカメックス を順に解決する', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガカメックス構築')!;
    const members = resolveBasicSelection(entry, teamToPokemons(entry)).map((pokemon) => pokemon.name);
    expect(members).toEqual(['indeedee-male', 'sneasler', 'blastoise']);
  });

  test('「〜選出:」のラベルが付いていても解決する（メガラグラージ構築）', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガラグラージ構築')!;
    const members = resolveBasicSelection(entry, teamToPokemons(entry)).map((pokemon) => pokemon.name);
    expect(members[0]).toBe('pelipper');
    expect(members).toContain('swampert');
  });

  test('解決できないチームでも3体を返す（ルールで補完）', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガガブリアスZ構築')!;
    const selection = selectTeamWithPlan(entry, teamToPokemons(entry));
    expect(selection.members).toHaveLength(3);
  });
});

  test('選出した3体で対戦が決着する', async () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガガブリアスZ構築')!;
    const foe = META_TEAMS.find((team) => team.name === 'メガラグラージ構築')!;
    const mine = selectTeam(teamToPokemons(entry)).members;
    const theirs = selectTeam(teamToPokemons(foe)).members;
    const result = await runBattle(
      mine, theirs,
      new RandomBattleAgent(new SeededRandom(1)),
      new RandomBattleAgent(new SeededRandom(2)),
      { maxTurns: 300, rng: new SeededRandom(3), leadA: mine[0], leadB: theirs[0] },
    );
    expect(mine).toHaveLength(3);
    expect(result.turns).toBeGreaterThan(0);
  });
});
