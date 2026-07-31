# Pokemon Champions Battle Engine v2.0

ポケモンチャンピオンズのバトルシミュレーションエンジン。`BattleEngine`がEvent Systemを介して特性・道具・天候・ステルスロックを処理し、Poke APIから最新データを取得してシミュレーションを行う。

## 特徴

- **Event System**: 特性・道具・天候をEvent Handlerとして`BattleEngine`内に実装
- **Poke API連携**: 最新のポケモンデータを自動取得・キャッシュ
- **Champions固有ルール**: 能力ポイント、Lv.50固定、メガシンカ対応
- **メタチームテンプレート**: 主要アーキタイプの定義済みチーム
- **選出AI**: アーキタイプ判定と最適選出ロジック
- **BattleAgent / BattleSession**: LLM（OpenCode Go）・ランダム・人間など、行動選択の方式を差し替え可能。
  1ターンずつ進行・undo/redo・分岐（fork）に対応
- **MCPサーバー**: バトルのルール適用をMCPツールとして公開。行動の決定はMCPクライアント側が担う

## 機能

### Poke API連携モジュール
- ポケモンデータ取得（種族値、タイプ、特性、技リスト）
- JSONキャッシュ機能（重複取得回避・手動クリア可能）

### バトルエンジン
- 攻撃力／防御力／ダメージ算出／タイプ相性補正を`BattleEngine`内で一貫して計算
- Event System（イベント発火・ハンドラー登録・連鎖・割り込み）
- ステルスロック（`BattleField`によるサイド別設置状態管理、交代時ダメージ）
- 天候ダメージ（砂嵐・あられの毎ターンダメージ、耐性タイプの判定）

### 特性（`src/rules/abilities/`のレジストリで管理）
- 天候変化（すなおこし、あめふらし、ひでり、ゆきふらし）
- いかく（相手の攻撃ランク-1）
- あまのじゃく（能力変化の向きを反転。`Pokemon.modifyStatStage()`で一括適用）
- ぼうだん（たま・ばくだん系の技を無効化）

### Event Handler実装
- 道具（たべのこし、いのちのたま、オボンのみ、きあいのタスキ、こだわり系3種）
- 天候（砂嵐、雨、晴れ、あられ）

### 技の挙動
- 能力ランク変化（自分・相手／確率付き）、状態異常（追加効果含む）、猛毒の累積ダメージ
- 場の効果（おいかぜ・リフレクター・トリックルーム）、やどりぎのタネ
- 天候依存の自己回復（あさのひざし等）、ウェザーボールのタイプ変化、多段技
- pivot技（とんぼがえり・ボルトチェンジ・クイックターン）: 攻撃後に使用者が交代する

### Champions固有ルール
- 能力ポイントシステム（1能力最大32、合計66）
- Lv.50固定
- メガシンカ仕様（種族値の増減量はポケモンごとに異なる。既定値はPoke API実データと突合済みの
  静的テーブルだが、`MegaEvolutionSystem.fromPokeApi(api)`でPoke APIから都度取得することも可能）

### 行動選択（BattleAgent）とバトル進行（BattleSession）
- `BattleAgent`インターフェースの実装を差し替えることで、行動選択の方式を切り替えられる
  - `RandomBattleAgent`: 合法手からランダムに選ぶ既定実装（無料・オフライン・大量検証向け）
  - `OpenCodeBattleAgent`: OpenCode Go（`https://opencode.ai/zen/go/v1`）経由でLLMに行動と思考理由を選ばせる
- `BattleSession`は1ターンずつ進行できる状態機械（`beginTurn` → 必要なら`applyForcedSwitch` → `applyTurn` → 必要なら`applyPivotSwitch` → `endTurn`）
  - pivot技（とんぼがえり等）が成立すると`applyTurn`は**技フェーズの途中で中断**し、`needsPivotSwitch(side)`がtrueになる。
    交代先を`applyPivotSwitch()`で渡すと、そこからターンの残りが再開される。
    本編と同じく**技の結果（ダメージ・撃破の有無・相手の行動）を見てから交代先を選べる**のが狙い
  - 中断中は`isTurnComplete()`がfalseになり、`endTurn()`は例外を投げる
  - 瀕死交代とpivot交代はどちらも`BattleContext.mustSwitch`として表現され、`getLegalActions()`が技を返さなくなる
- `snapshot()`/`restore()`/`fork()`により、`BattleHistory`でのundo/redoや同一局面からの分岐探索に対応
  - ターン進行状態（`beginTurn`済みか・技フェーズの途中か）も`BattleSnapshot.session`に含まれるため、
    中断状態のままsnapshot/restore/forkできる

### MCPサーバー
- `src/mcp-battle-server.ts`の`createBattleServer()`が、行動の決定を一切行わない「ルール適用専任」のMCPサーバーを構築する
- 公開ツール: `start_battle` / `get_battle_state` / `apply_forced_switch` / `apply_turn` / `apply_pivot_switch` / `undo` / `redo` / `fork_battle` / `get_battle_log` / `list_battles`
- `apply_turn`の`actionA`/`actionB`には具体的な行動（`{type:"move",moveIndex}`等）か`"auto"`（その陣営はサーバー内蔵の`RandomBattleAgent`に任せる）を渡せる
- pivot技で中断した場合は`isTurnComplete:false` / `needsPivotSwitchSide0|1:true`で返るので、`apply_pivot_switch`で交代先を指定して再開する
- 起動: `npm run mcp:dev`（開発）/ `npm run mcp`（ビルド後）。stdioトランスポートで動作するため、Claude Codeなど任意のMCPクライアントからstdio起動で接続できる

## クイックスタート

```bash
# 依存関係インストール
npm install

# サンプルバトル実行（RandomBattleAgent、OPENCODE_API_KEYがあればOpenCodeBattleAgent）
npm run sample:dev

# MCPサーバー起動（stdio）
npm run mcp:dev

# テスト実行
npm test

# 開発時の型チェック（watch）
npm run dev
```

## 使用例

### BattleSession + BattleAgent（推奨）

```typescript
import { Pokemon, Move, BattleSession, BattleHistory, RandomBattleAgent } from './src/index.js';

const teamA = [new Pokemon({ name: 'ガブリアス', types: ['dragon', 'ground'], ability: 'rough-skin', item: 'choice-scarf',
  baseStats: { HP: 108, ATK: 130, DEF: 95, SPATK: 80, SPDEF: 85, SPEED: 102 },
  moves: [new Move({ name: 'じしん', type: 'ground', power: 100, accuracy: 100, pp: 10, category: 'physical' })] })];
const teamB = [/* ... */];

const session = await BattleSession.start(teamA, teamB);
const history = new BattleHistory(session);
const agent = new RandomBattleAgent(); // または new OpenCodeBattleAgent()

while (!session.isFinished() && session.engine.turn < 20) {
  await history.playTurn(agent, agent);
}

console.log(session.engine.getLog());
console.log('winner:', session.winner()); // 0 | 1 | null

// 直前のターンをやり直したい場合
history.undo();
// 現在の局面から独立した分岐を試したい場合
const branch = history.fork();
```

### BattleEngineを直接操作する（低レベルAPI）

```typescript
import { BattleEngine, Pokemon } from './src/index.js';

const engine = new BattleEngine();
engine.setActivePokemon(0, garchomp);
engine.setActivePokemon(1, opponent);

engine.startTurn();
engine.switchIn(garchomp, teamA, 0); // 第3引数の side を渡すとステルスロック等が適用される
engine.switchIn(opponent, teamB, 1);

const result = engine.useMove(garchomp, opponent, garchomp.moves[0]);
console.log(engine.getLog());
```

## アーキテクチャ

```
src/
├── battle-engine.ts          # メインバトルエンジン（攻撃/防御/ダメージ計算、Event System、
│                             #   特性・道具・天候・ステルスロックのハンドラーを内包）
├── battle-field.ts           # ステルスロック等サイド別フィールド状態
├── battle-runner.ts          # BattleSession（1ターンずつ進行・snapshot/restore/fork）/ BattleHistory（undo/redo）
├── battle-snapshot.ts        # 盤面のプレーンデータ化（snapshot/restore）
├── pokemon.ts                # ポケモンドメインモデル
├── move.ts                   # 技モデル
├── ability.ts                # 特性モデル
├── item.ts                   # アイテムモデル
├── team.ts                   # チームモデル
├── type-chart.ts             # タイプ相性表
├── event-emitter.ts          # Event System
├── sample-battle.ts          # サンプルバトル（BattleSession + BattleAgent）
├── mcp-server.ts             # MCPサーバーの起動エントリーポイント（stdio）
├── mcp-battle-server.ts      # MCPツール定義本体（createBattleServer）
├── ai/
│   ├── selection-ai.ts           # チームのアーキタイプ判定
│   ├── battle-agent.ts           # BattleAgentインターフェース / RandomBattleAgent
│   └── opencode-battle-agent.ts  # OpenCode Go経由のLLM BattleAgent
├── api/
│   └── pokemon-api.ts    # Poke API連携・キャッシュ
├── data/
│   └── meta-teams.ts     # メタチームテンプレート
└── rules/
    ├── stat-point-system.ts  # 能力ポイントシステム・Lv.50固定
    └── mega-evolution.ts     # メガシンカ（Poke APIから種族値差分を算出するfromPokeApiあり）
```

## テスト

```bash
# 全テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# 特定テスト
npm test -- --testNamePattern="ダメージ計算"
```

## ドキュメント

- [設計ドキュメント](docs/BATTLE_SYSTEM_DESIGN.md)
- [エージェントインターフェース](docs/AGENT_INTERFACE.md)（Python時代の記述が残っており現状のBattleAgentとは一致しない箇所があります）
- [実装済みアイテム](docs/IMPLEMENTED_ITEMS.md)
- `npm run docs`でTypeDocによるAPIリファレンスを`docs/api/`に生成できます

## 開発環境

- Node.js 18+
- npm

## ライセンス

MIT
