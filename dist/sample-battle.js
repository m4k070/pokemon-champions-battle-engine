import { Pokemon } from './pokemon.js';
import { BattleSession, BattleHistory } from './battle-runner.js';
import { RandomBattleAgent } from './ai/battle-agent.js';
import { OpenCodeBattleAgent } from './ai/opencode-battle-agent.js';
const kabaldonData = {
    name: 'カバルドン',
    types: ['ground'],
    ability: 'sand-stream',
    item: 'rocky-helmet',
    baseStats: { HP: 263, ATK: 135, DEF: 195, SPATK: 75, SPDEF: 135, SPEED: 65 },
    moves: [
        { name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, maxPP: 10, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'あくび', type: 'normal', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: 'sleep', priority: 0, effectChance: null },
        { name: 'こおりのキバ', type: 'ice', power: 65, accuracy: 95, pp: 15, maxPP: 15, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'まもる', type: 'normal', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: null, priority: 0, effectChance: null },
    ],
};
const windyData = {
    name: 'ウインディ',
    types: ['fire'],
    ability: 'intimidate',
    item: 'sitrus-berry',
    baseStats: { HP: 215, ATK: 145, DEF: 135, SPATK: 100, SPDEF: 135, SPEED: 95 },
    moves: [
        { name: 'バークアウト', type: 'dark', power: 55, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'じだんだ', type: 'ground', power: 75, accuracy: 100, pp: 10, maxPP: 10, category: 'physical', status: null, priority: 0, effectChance: null },
        { name: 'おにび', type: 'fire', power: 0, accuracy: 85, pp: 15, maxPP: 15, category: 'status', status: 'burn', priority: 0, effectChance: null },
        { name: 'あさのひざし', type: 'normal', power: 0, accuracy: 100, pp: 5, maxPP: 5, category: 'status', status: null, priority: 0, effectChance: null },
    ],
};
const dragonData = {
    name: 'ドラパルト',
    types: ['dragon', 'ghost'],
    ability: 'infiltrator',
    item: 'life-orb',
    baseStats: { HP: 168, ATK: 175, DEF: 95, SPATK: 175, SPDEF: 95, SPEED: 213 },
    moves: [
        { name: 'りゅうのはどう', type: 'dragon', power: 85, accuracy: 100, pp: 10, maxPP: 10, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'たたりめ', type: 'ghost', power: 65, accuracy: 100, pp: 10, maxPP: 10, category: 'special', status: null, priority: 0, effectChance: null },
        { name: '10まんボルト', type: 'electric', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
        { name: 'かえんほうしゃ', type: 'fire', power: 90, accuracy: 100, pp: 15, maxPP: 15, category: 'special', status: null, priority: 0, effectChance: null },
    ],
};
export { kabaldonData, windyData, dragonData };
const MAX_TURNS = 10;
function printReasoningLog(history) {
    const entries = history.session.reasoningLog.filter((entry) => entry.reasoning);
    if (entries.length === 0)
        return;
    console.log('\n' + '='.repeat(50));
    console.log('=== 思考ログ ===');
    for (const entry of entries) {
        console.log(`[T${entry.turn} / ${entry.pokemonName}] ${entry.reasoning}`);
    }
}
async function main() {
    const teamA = [new Pokemon(kabaldonData)];
    const teamB = [new Pokemon(windyData), new Pokemon(dragonData)];
    const session = await BattleSession.start(teamA, teamB);
    const history = new BattleHistory(session);
    // OPENCODE_API_KEYがあればLLMに行動選択させる。なければランダムエージェント（無料・オフライン）。
    const useLLM = Boolean(process.env.OPENCODE_API_KEY);
    const agentA = useLLM ? new OpenCodeBattleAgent() : new RandomBattleAgent();
    const agentB = useLLM ? new OpenCodeBattleAgent() : new RandomBattleAgent();
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
//# sourceMappingURL=sample-battle.js.map