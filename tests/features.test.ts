import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { BattleSession } from '../src/battle-runner.js';
import { SeededRandom } from '../src/rng.js';
import { extractFeatures } from '../src/ai/features.js';
import { abilityClassFlags } from '../src/ai/ability-classes.js';

// 特徴量の追加（2026-10-24）の回帰テスト。
// 列名は学習データのヘッダになるので、増減は意図したときだけにする。

const stats = { HP: 200, ATK: 100, DEF: 100, SPATK: 100, SPDEF: 100, SPEED: 100 };

const mon = (name: string, options: { ability?: Pokemon['ability']; item?: Pokemon['item']; moves?: ReturnType<typeof createMove>[] } = {}): Pokemon =>
  new Pokemon({
    name,
    types: ['normal'],
    ability: options.ability ?? 'none',
    item: options.item ?? null,
    baseStats: stats,
    moves: options.moves ?? [createMove({ name: 'たいあたり', type: 'normal', power: 40, accuracy: 100, pp: 10, category: 'physical' })],
  });

describe('特徴量の追加分', () => {
  test('列数は77で、旧来の列名は残っている（weather だけ one-hot に置換）', async () => {
    const session = await BattleSession.start([mon('A')], [mon('B')], { information: 'partial', rng: new SeededRandom(1) });
    const features = extractFeatures(session.getContext(0));

    expect(Object.keys(features)).toHaveLength(77);
    expect(features).not.toHaveProperty('weather');
    expect(features).toHaveProperty('weather_rain');
    expect(features).toHaveProperty('turn');
    expect(features).toHaveProperty('type_advantage');
  });

  test('天候は種類ごとに分かれ、残りターンも入る', async () => {
    const session = await BattleSession.start([mon('A')], [mon('B')], { information: 'partial', rng: new SeededRandom(1) });
    session.engine.weather = 'sun';
    session.engine.weatherTurnsLeft = 3;

    const features = extractFeatures(session.getContext(0));

    expect(features.weather_sun).toBe(1);
    expect(features.weather_rain).toBe(0);
    expect(features.weather_turns_left).toBe(3);
  });

  test('状態異常は種類ごとに分かれる（やけどと猛毒を区別する）', async () => {
    const burned = mon('やけど');
    const toxic = mon('もうどく');
    const session = await BattleSession.start([burned], [toxic], { information: 'partial', rng: new SeededRandom(1) });
    burned.applyStatus('burn', new SeededRandom(2));
    toxic.applyStatus('badly-poisoned', new SeededRandom(3));

    const features = extractFeatures(session.getContext(0));

    expect(features.status_burn_self).toBe(1);
    expect(features.status_poison_self).toBe(0);
    expect(features.status_toxic_opp).toBe(1);
    expect(features.status_burn_opp).toBe(0);
    expect(features.toxic_elapsed_opp).toBe(0); // 付与直後は0ターン経過
  });

  test('設置は層数を正規化して入る（自分側と相手側を分ける）', async () => {
    const a = mon('A');
    const b = mon('B');
    const session = await BattleSession.start([a], [b], { information: 'partial', rng: new SeededRandom(1) });
    session.engine.field.spikes.playerA = 3;
    session.engine.field.toxicSpikes.playerB = 2;

    const features = extractFeatures(session.getContext(0));

    expect(features.spikes_self).toBe(1);
    expect(features.spikes_opp).toBe(0);
    expect(features.toxic_spikes_opp).toBe(1);
    expect(features.toxic_spikes_self).toBe(0);
  });

  test('PP残量は比で入り、減ると下がる', async () => {
    const attacker = mon('A');
    const target = mon('B');
    const session = await BattleSession.start([attacker], [target], { information: 'partial', rng: new SeededRandom(1) });

    const before = extractFeatures(session.getContext(0));
    expect(before.pp_min_self).toBe(1);
    expect(before.pp_sum_self).toBe(1);

    session.engine.useMove(attacker, session.engine.getOpponent(attacker)!, attacker.moves[0]!);

    const after = extractFeatures(session.getContext(0));
    expect(after.pp_min_self).toBeLessThan(1);
    expect(after.pp_sum_self).toBeLessThan(1);
  });

  test('相手の特性は判明するまで0、判明後にクラスが立つ', async () => {
    const mine = mon('A');
    const opponent = mon('B', { ability: 'clear-body' });
    const session = await BattleSession.start([mine], [opponent], { information: 'partial', rng: new SeededRandom(1) });

    const hidden = extractFeatures(session.getContext(0));
    expect(hidden.ability_known_opp).toBe(0);
    expect(hidden.ability_stat_opp).toBe(0);

    session.engine.observeAbility(opponent);
    const revealed = extractFeatures(session.getContext(0));
    expect(revealed.ability_known_opp).toBe(1);
    expect(revealed.ability_stat_opp).toBe(1);
    expect(revealed.ability_denial_opp).toBe(0);
  });

  test('持ち物は自分だけ確実に見え、相手は判明時のみ', async () => {
    const mine = mon('A', { item: 'choice-scarf' });
    const opponent = mon('B', { item: 'leftovers' });
    const session = await BattleSession.start([mine], [opponent], { information: 'partial', rng: new SeededRandom(1) });

    const features = extractFeatures(session.getContext(0));

    expect(features.item_choice_self).toBe(1);
    expect(features.leftovers_self).toBe(0);
    expect(features.leftovers_opp).toBe(0); // 未判明
  });

  test('特性クラスは複数に属してよい', () => {
    expect(abilityClassFlags('chlorophyll').weather).toBe(1);
    expect(abilityClassFlags('clear-body').stat).toBe(1);
    expect(abilityClassFlags('flash-fire').denial).toBe(1);
    expect(abilityClassFlags('regenerator').recovery).toBe(1);
    expect(abilityClassFlags('none').stat).toBe(0);
  });
});
