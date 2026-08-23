import { Pokemon } from './pokemon.js';
import { BattleSession, BattleHistory } from './battle-runner.js';
import { RandomBattleAgent } from './ai/battle-agent.js';
import { OpenCodeBattleAgent } from './ai/opencode-battle-agent.js';
import type { BattleAgent } from './ai/battle-agent.js';
import { createMove } from './move.js';
import type { BaseStats, TypeName } from './types.js';

const kabaldonData = {
  name: 'カバルドン',
  types: ['ground' as TypeName],
  ability: 'sand-stream',
  item: 'rocky-helmet',
  baseStats: { HP: 108, ATK: 112, DEF: 118, SPATK: 68, SPDEF: 72, SPEED: 47 } as BaseStats,
  moves: [
    createMove({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10 }),
    createMove({ name: 'あくび', type: 'normal', category: 'status', accuracy: 100, pp: 10, status: 'sleep' }),
    createMove({ name: 'こおりのキバ', type: 'ice', power: 65, accuracy: 95, pp: 15 }),
    createMove({ name: 'まもる', type: 'normal', category: 'status', accuracy: 100, pp: 10 }),
  ],
};

const windyData = {
  name: 'ウインディ',
  types: ['fire' as TypeName],
  ability: 'intimidate',
  item: 'sitrus-berry',
  baseStats: { HP: 90, ATK: 110, DEF: 80, SPATK: 100, SPDEF: 80, SPEED: 95 } as BaseStats,
  moves: [
    createMove({ name: 'バークアウト', type: 'dark', category: 'special', power: 55, accuracy: 100, pp: 15 }),
    createMove({ name: 'じだんだ', type: 'ground', power: 75, accuracy: 100, pp: 10 }),
    createMove({ name: 'おにび', type: 'fire', category: 'status', accuracy: 85, pp: 15, status: 'burn' }),
    createMove({ name: 'あさのひざし', type: 'normal', category: 'status', accuracy: 100, pp: 5 }),
  ],
};

const dragonData = {
  name: 'ドラパルト',
  types: ['dragon', 'ghost'] as TypeName[],
  ability: 'infiltrator',
  item: 'life-orb',
  baseStats: { HP: 88, ATK: 120, DEF: 75, SPATK: 100, SPDEF: 75, SPEED: 142 } as BaseStats,
  moves: [
    createMove({ name: 'りゅうのはどう', type: 'dragon', category: 'special', power: 85, accuracy: 100, pp: 10 }),
    createMove({ name: 'たたりめ', type: 'ghost', category: 'special', power: 65, accuracy: 100, pp: 10 }),
    createMove({ name: '10まんボルト', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15 }),
    createMove({ name: 'かえんほうしゃ', type: 'fire', category: 'special', power: 90, accuracy: 100, pp: 15 }),
  ],
};

export { kabaldonData, windyData, dragonData };

const MAX_TURNS = 10;

function printReasoningLog(history: BattleHistory): void {
  const entries = history.session.reasoningLog.filter((entry) => entry.reasoning);
  if (entries.length === 0) return;

  console.log('\n' + '='.repeat(50));
  console.log('=== 思考ログ ===');
  for (const entry of entries) {
    console.log(`[T${entry.turn} / ${entry.pokemonName}] ${entry.reasoning}`);
  }
}

async function main(): Promise<void> {
  const teamA = [new Pokemon(kabaldonData)];
  const teamB = [new Pokemon(windyData), new Pokemon(dragonData)];

  const session = await BattleSession.start(teamA, teamB);
  const history = new BattleHistory(session);

  // OPENCODE_API_KEYがあればLLMに行動選択させる。なければランダムエージェント（無料・オフライン）。
  const useLLM = Boolean(process.env.OPENCODE_API_KEY);
  const agentA: BattleAgent = useLLM ? new OpenCodeBattleAgent() : new RandomBattleAgent();
  const agentB: BattleAgent = useLLM ? new OpenCodeBattleAgent() : new RandomBattleAgent();

  console.log('=== サンプルバトル開始 ===');
  console.log(`Team A: ${teamA.map((p) => p.name).join(', ')}`);
  console.log(`Team B: ${teamB.map((p) => p.name).join(', ')}`);
  console.log(`行動選択: ${useLLM ? 'OpenCode Go (LLM)' : 'RandomBattleAgent'}`);
  console.log();

  while (!session.isFinished() && session.engine.turn < MAX_TURNS) {
    await history.playTurn(agentA, agentB);
  }

  console.log(session.engine.getLog());
  printReasoningLog(history);

  console.log('\n' + '='.repeat(50));
  const winner = session.winner();
  console.log(winner === null ? '引き分け（ターン上限に到達）' : `${winner === 0 ? 'Team A' : 'Team B'}の勝利！`);

  // おまけ: 直前のターンをundo/redoできることの確認
  if (history.canUndo()) {
    const beforeUndoTurn = session.engine.turn;
    history.undo();
    console.log(`\n[undo] ターン${beforeUndoTurn} -> ${session.engine.turn}まで巻き戻し`);
    history.redo();
    console.log(`[redo] ターン${session.engine.turn}まで復元`);
  }
}

main();
