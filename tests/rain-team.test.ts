import { BattleEngine } from '../src/battle-engine.js';
import { BattleSession } from '../src/battle-runner.js';
import { Pokemon } from '../src/pokemon.js';
import { Move } from '../src/move.js';
import { MegaEvolutionSystem } from '../src/rules/mega-evolution.js';

// 雨パ構築（メガラグラージ + すいすい）の実戦検証。
// 2026-08-20: 天候変化技（あまごい等）を実装したので、雨パのシナリオが組めるようになった。
describe('雨パ構築（メガラグラージ+すいすい）', () => {
  const rainDance = () => new Move({ name: 'Rain Dance', type: 'water', category: 'status', weather: 'rain', pp: 10 });
  const sunnyDay = () => new Move({ name: 'Sunny Day', type: 'fire', category: 'status', weather: 'sun', pp: 10 });

  const makeSwampert = () => new Pokemon({
    name: 'Swampert',
    baseName: 'swampert',
    types: ['water', 'ground'],
    ability: 'torrent',
    item: 'swampertite',
    baseStats: { HP: 100, ATK: 110, DEF: 90, SPATK: 85, SPDEF: 90, SPEED: 60 },
    moves: [new Move({ name: 'Surf', type: 'water', power: 90, accuracy: 100, pp: 10, category: 'special' })],
  });

  const makeDefender = () => new Pokemon({
    name: 'Defender',
    types: ['normal'],
    ability: 'none',
    item: null,
    baseStats: { HP: 200, ATK: 10, DEF: 100, SPATK: 10, SPDEF: 100, SPEED: 10 },
    moves: [new Move({ name: 'Tackle', type: 'normal', power: 40, accuracy: 100, pp: 5, category: 'physical' })],
  });

  test('あまごい: 天候が雨になる（5ターン）', () => {
    const engine = new BattleEngine();
    const rainDancer = new Pokemon({
      name: 'Politoed',
      baseName: 'politoed',
      types: ['water'],
      ability: 'drizzle',
      item: null,
      baseStats: { HP: 90, ATK: 75, DEF: 75, SPATK: 90, SPDEF: 100, SPEED: 70 },
    });
    const defender = makeDefender();
    engine.setActivePokemon(0, rainDancer);
    engine.setActivePokemon(1, defender);

    expect(engine.weather).toBeNull();

    engine.useMove(rainDancer, defender, rainDance());
    expect(engine.weather).toBe('rain');
    expect(engine.weatherTurnsLeft).toBe(5);
  });

  test('にほんばれ: 天候が晴れになる（対称性の確認）', () => {
    const engine = new BattleEngine();
    const sunner = new Pokemon({
      name: 'Ninetales',
      baseName: 'ninetales',
      types: ['fire'],
      ability: 'drought',
      item: null,
      baseStats: { HP: 73, ATK: 76, DEF: 75, SPATK: 81, SPDEF: 100, SPEED: 100 },
    });
    const defender = makeDefender();
    engine.setActivePokemon(0, sunner);
    engine.setActivePokemon(1, defender);

    engine.useMove(sunner, defender, sunnyDay());
    expect(engine.weather).toBe('sun');
    expect(engine.weatherTurnsLeft).toBe(5);
  });

  test('雨パ: メガラグラージはメガシンカですいすいを得て、雨で素早さ2倍になる', async () => {
    const engine = new BattleEngine();
    const system = new MegaEvolutionSystem();
    const swampert = makeSwampert();
    const defender = makeDefender();
    engine.setActivePokemon(0, swampert);
    engine.setActivePokemon(1, defender);

    // メガシンカ前: 素早さは通常
    const speedBefore = engine.calculateSpeed(swampert);

    // メガシンカ → すいすい
    system.megaEvolve(swampert);
    expect(swampert.ability).toBe('swift-swim');

    // 雨なし: メガ後素早さ（+10）
    const speedNoRain = engine.calculateSpeed(swampert);
    expect(speedNoRain).toBe(speedBefore + 10);

    // 雨: すいすいで2倍
    engine.weather = 'rain';
    const speedRain = engine.calculateSpeed(swampert);
    expect(speedRain).toBe(speedNoRain * 2);
  });

  test('実戦: あめふらし（ニョロトノ）→メガラグラージで雨パの対戦が成立する', async () => {
    // シングル63のシナリオ: 先発ニョロトノ（あめふらし）が場に出て雨 → メガラグラージで詰める
    const rainDancer = new Pokemon({
      name: 'Politoed',
      baseName: 'politoed',
      types: ['water'],
      ability: 'drizzle', // あめふらし: 場に出た時点で雨が降る（あまごい技は不要）
      item: null,
      baseStats: { HP: 90, ATK: 75, DEF: 75, SPATK: 90, SPDEF: 100, SPEED: 70 },
      moves: [new Move({ name: 'Surf', type: 'water', power: 90, accuracy: 100, pp: 10, category: 'special' })],
    });
    const swampert = makeSwampert();

    // ノーマルタイプで水等倍・高HP: 1ターン目のサーフで倒れないようにする
    const opponent = new Pokemon({
      name: 'Opponent',
      types: ['normal'],
      ability: 'none',
      item: null,
      baseStats: { HP: 250, ATK: 80, DEF: 80, SPATK: 100, SPDEF: 80, SPEED: 90 },
      moves: [new Move({ name: 'Flamethrower', type: 'fire', power: 90, accuracy: 100, pp: 10, category: 'special' })],
    });

    const session = await BattleSession.start([rainDancer, swampert], [opponent]);

    // 先発ニョロトノが場に出た時点で雨（あめふらし）
    expect(session.engine.weather).toBe('rain');

    // 1ターン目: サーフで攻撃（雨で強化）
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );

    // 2ターン目: メガラグラージに交代
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'switch', pokemonIndex: 1 } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    expect(session.activeA.name).toBe('Swampert');

    // 3ターン目: メガシンカ（すいすい獲得）
    session.beginTurn();
    session.applyTurn(
      { action: { type: 'move', moveIndex: 0, target: 0, megaEvolve: true } },
      { action: { type: 'move', moveIndex: 0, target: 0 } }
    );
    expect(session.activeA.isMega).toBe(true);
    expect(session.activeA.ability).toBe('swift-swim');

    // 雨 + すいすい: 素早さ2倍（相手の素早さ90より速い）
    const speed = session.engine.calculateSpeed(session.activeA);
    expect(speed).toBeGreaterThan(90);
  });
});
