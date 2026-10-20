import { META_TEAMS, teamToPokemons, toPokemon } from '../src/data/meta-teams.js';
import { isDamageMove, isStatusMove } from '../src/move.js';
import { GAMEWITH_TEAMS } from '../src/data/meta-teams-catalog.js';
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

  // gamewith 最強パーティランキング（2026-10-19 取得）の Tier1〜3。11構築すべてを
  // エンジンに投入できることを固定する。構築データは data/gamewith-555537-2026-10-19.json から
  // scripts/generate-meta-teams-catalog.mjs が生成する（手書きの転記ミスを避ける）。
  test('gamewith Tier1〜3 の11構築が META_TEAMS に載っている', () => {
    expect(GAMEWITH_TEAMS).toHaveLength(11);
    expect(META_TEAMS).toHaveLength(GAMEWITH_TEAMS.length + 1);

    const names = GAMEWITH_TEAMS.map((t) => t.name);
    expect(names).toContain('メガガブリアスZ構築');
    expect(names).toContain('メガグソクムシャ構築');
    expect(names).toContain('カバマンダ構築');
    expect(names).toContain('メガリザードンY構築');
    expect(names).toContain('メガジュペッタ構築');
    expect(names).toContain('メガカメックス構築');
    expect(names).toContain('カイリューガルド構築');
    expect(names).toContain('メガライチュウY構築');
    expect(names).toContain('クエスピクシー構築');
    expect(names).toContain('カバルカ構築');
    expect(names).toContain('メガラグラージ構築');
    // 同名の構築が混ざると「どこに何が入ったか」が追えなくなる。
    expect(new Set(META_TEAMS.map((t) => t.name)).size).toBe(META_TEAMS.length);
  });

  test('全構築の能力ポイントが合計66・各32以内で、選出が空でない', () => {
    for (const entry of META_TEAMS) {
      expect(entry.basicSelection).not.toBe('');
      expect(entry.alternativeSelections.length).toBeGreaterThan(0);

      for (const member of entry.members) {
        const total = Object.values(member.statPoints).reduce((sum, v) => sum + (v ?? 0), 0);
        expect(total).toBeLessThanOrEqual(66);
        for (const value of Object.values(member.statPoints)) {
          expect(value ?? 0).toBeLessThanOrEqual(32);
        }
        // 持ち物なしの枠は作らない（構築ページの全枠に持ち物が記載されている）。
        expect(member.item).not.toBeNull();
      }
    }
  });

  // 実数値の突き合わせ。gamewith の構築カードに出ている実数値と、
  // pokedb（champs.pokedb.tokyo、シーズンM-7）の使用率1位の型・持ち物・能力ポイントが
  // 一致する3体で、エンジンの計算結果が両方の記載と一致することを固定する。
  //   ガブリアス: おくびょう H2 C32 S32 ＋ ガブリアスナイトZ（pokedb: CS + h 23.7% / 持ち物1位）
  //   ミミッキュ: いじっぱり H1 A32 B1 S32 ＋ いのちのたま（pokedb: AS + hb 28.0% / 持ち物1位）
  //   キラフロル: おくびょう H1 B1 C32 S32 ＋ きあいのタスキ（pokedb: CS + hb 41.5% / 持ち物1位）
  test('実数値が pokedb の1位構成と一致する（ガブリアス・ミミッキュ・キラフロル）', () => {
    const findMember = (team: string, name: string) => {
      const entry = GAMEWITH_TEAMS.find((t) => t.name === team);
      expect(entry).toBeDefined();
      const member = entry!.members.find((m) => m.name === name);
      expect(member).toBeDefined();
      return member!;
    };

    const garchomp = findMember('メガガブリアスZ構築', 'garchomp');
    expect(garchomp.nature).toBe('おくびょう');
    expect(garchomp.item).toBe('garchompite-z');
    expect(garchomp.statPoints).toEqual({ HP: 2, SPATK: 32, SPEED: 32 });
    expect(toPokemon(garchomp).stats).toEqual({
      HP: 185, ATK: 135, DEF: 115, SPATK: 132, SPDEF: 105, SPEED: 169,
    });

    const mimikyu = findMember('メガガブリアスZ構築', 'mimikyu-disguised');
    expect(mimikyu.nature).toBe('いじっぱり');
    expect(mimikyu.item).toBe('life-orb');
    expect(mimikyu.statPoints).toEqual({ HP: 1, ATK: 32, DEF: 1, SPEED: 32 });
    expect(toPokemon(mimikyu).stats).toEqual({
      HP: 131, ATK: 156, DEF: 101, SPATK: 63, SPDEF: 125, SPEED: 148,
    });

    const glimmora = findMember('カバマンダ構築', 'glimmora');
    expect(glimmora.nature).toBe('おくびょう');
    expect(glimmora.item).toBe('focus-sash');
    expect(glimmora.statPoints).toEqual({ HP: 1, DEF: 1, SPATK: 32, SPEED: 32 });
    expect(toPokemon(glimmora).stats).toEqual({
      HP: 159, ATK: 67, DEF: 111, SPATK: 182, SPDEF: 101, SPEED: 151,
    });
  });

  test('同じ枠から作った2体で技のPPが共有されない（ミラー対戦の取り違え防止）', () => {
    const member = META_TEAMS[0].members[0];
    const a = toPokemon(member);
    const b = toPokemon(member);

    expect(a.moves[0]).not.toBe(b.moves[0]);
    expect(a.moves[0].pp).toBe(b.moves[0].pp);

    a.moves[0].pp -= 1;
    expect(b.moves[0].pp).toBe(member.moves[0].pp);
  });

  test('メガストーンを持つ枠はすべてメガシンカできる（未登録ストーンの検出）', () => {
    const system = new MegaEvolutionSystem();
    // ストーン名は「-ite」で終わる（garchompite-z / raichunite-y のような接尾辞付きも含む）。
    const isStone = (item: string) => /ite(-[a-z]+)?$/.test(item);
    const stoneHolders = META_TEAMS.flatMap((entry) => entry.members).filter(
      (member) => member.item !== null && isStone(member.item),
    );
    expect(stoneHolders.length).toBeGreaterThan(0);

    for (const member of stoneHolders) {
      // 未登録のストーンだと canMegaEvolve が false になる（静かに非メガ扱いになるのを防ぐ）。
      // 失敗時にどの枠か分かるよう、名前と結果の組で比較する。
      expect([member.displayName, system.canMegaEvolve(toPokemon(member))]).toEqual([
        member.displayName,
        true,
      ]);
    }
  });

  test('全構築（試作PT＋gamewith 11構築）で start_battle して1試合を完走できる', async () => {
    for (const [index, entry] of META_TEAMS.entries()) {
      const session = await BattleSession.start(teamToPokemons(entry), teamToPokemons(entry), {
        rng: new SeededRandom(2026 + index),
      });
      const agent = new RandomBattleAgent(fixedRandom(0.5));

      let turns = 0;
      while (!session.isFinished() && turns < 500) {
        await session.playTurn(agent, agent);
        turns++;
      }

      // どの構築でも「最後まで走って勝敗が付く」ことを1件ずつ確認する。
      // 失敗時にどの構築が何ターンで止まったか分かるよう、文字列で比較する。
      expect(`${entry.name}: finished=${session.isFinished()} turns=${turns}`).toContain('finished=true');
      expect(session.winner()).not.toBeNull();
      expect(session.engine.getLog().length).toBeGreaterThan(0);
    }
  }, 120000);

  test('メガカメックス構築の からをやぶる は A+2/C+2/S+2・B-1/D-1 を持つ', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガカメックス構築')!;
    const blastoise = toPokemon(entry.members.find((member) => member.name === 'blastoise')!);
    const move = blastoise.moves.find((candidate) => candidate.name === 'からをやぶる')!;

    expect(isStatusMove(move)).toBe(true);
    if (!isStatusMove(move)) throw new Error('からをやぶる は変化技のはず');
    expect(move.selfStatChange).toEqual([
      { stat: 'DEF', delta: -1 },
      { stat: 'SPDEF', delta: -1 },
      { stat: 'ATK', delta: 2 },
      { stat: 'SPATK', delta: 2 },
      { stat: 'SPEED', delta: 2 },
    ]);
  });

  test('メガカメックス構築の だいちのはどう は terrainPulse を持つ', () => {
    const entry = META_TEAMS.find((team) => team.name === 'メガカメックス構築')!;
    const blastoise = toPokemon(entry.members.find((member) => member.name === 'blastoise')!);
    const move = blastoise.moves.find((candidate) => candidate.name === 'だいちのはどう')!;

    expect(isDamageMove(move)).toBe(true);
    if (!isDamageMove(move)) throw new Error('だいちのはどう はダメージ技のはず');
    expect(move.terrainPulse).toBe(true);
    expect(move.type).toBe('normal');
    expect(move.power).toBe(50);
  });
});
