# Pokemon Champions Battle Engine v2.0

ポケモンチャンピオンズのバトルシミュレーションエンジン。Game FreakのCEDEC2026講演で示されたSection設計とEvent Systemを採用し、Poke APIから最新データを取得して正確なシミュレーションを行う。

## 特徴

- **Section設計**: Game FreakのCEDEC2026講演に基づくSection/Event Handler設計
- **Event System**: 特性・道具・天気をEvent Handlerとして独立実装
- **Poke API連携**: 最新のポケモンデータを自動取得・キャッシュ
- **Champions固有ルール**: 能力ポイント、Lv.50固定、メガシンカ対応
- **メタチームテンプレート**: 主要アーキタイプの定義済みチーム
- **選出AI**: アーキタイプ判定と最適選出ロジック

## 機能

### Step 1: Poke API連携モジュール
- ポケモンデータ取得（種族値、タイプ、特性、技リスト）
- JSONキャッシュ機能（重複取得回避・手動クリア可能）

### Step 2: Section設計バトルエンジン
- 攻撃力セクション / 防御力セクション / ダメージ算出セクション / ダメージ補正セクション
- Event System（イベント発火・ハンドラー登録・連鎖・割り込み）

### Step 3: Event Handler実装
- 特性（すなおこし、いかく、へんげんじざい等）
- 道具（たべのこし、いのちのたま、オボンのみ、きあいのタスキ、こだわりスカーフ）
- 天気（砂嵐、雨、晴れ、霰）

### Step 3: Champions固有ルール
- 能力ポイントシステム（1能力最大32、合計66）
- Lv.50固定
- メガシンカ仕様

## クイックスタート

```bash
# 依存関係インストール
npm install

# シミュレーション実行
npm run simulate

# テスト実行
npm test

# 開発サーバー起動
npm run dev
```

## 使用例

```javascript
import { PokemonAPI, BattleEngine, Pokemon, PokemonDataCache } from './src/battle-engine.js';

// キャッシュ作成
const cache = new PokemonDataCache();
const api = new PokemonAPI(cache);

// ポケモンデータ取得
const garchompData = await api.fetchPokemonData(445); // ガブリアス

// ポケモン作成
const garchomp = new Pokemon({
  name: 'ガブリアス',
  types: ['dragon', 'ground'],
  ability: 'rough-skin',
  item: 'choice-scarf',
  stats: garchompData.baseStats,
  moves: [...]
});

// バトルエンジン初期化
const engine = new BattleEngine();

// バトル実行
engine.startTurn();
engine.switchIn(garchomp, teamA);
engine.switchIn(opponent, teamB);

// 技を使用
const result = engine.useMove(attacker, defender, move);
console.log(engine.getLog());
```

## アーキテクチャ

```
src/
├── battle-engine.js      # メインバトルエンジン
├── battle-engine-v2.js   # 完全版エンジン
├── battle-engine.py      # Python版
├── sample_battle.js      # サンプルバトル
├── sample_battle.py      # Python版サンプル
├── domain/
│   ├── pokemon.js        # ポケモンドメインモデル
│   ├── move.js           # 技モデル
│   ├── ability.js        # 特性モデル
│   ├── item.js           // アイテムモデル
│   └── team.js           // チームモデル
├── engine/
│   ├── battle-engine.js      # メインエンジン
│   ├── sections/             # Section実装
│   │   ├── attack-section.js
│   │   ├── defense-section.js
│   │   ├── damage-section.js
│   │   └── modifier-section.js
│   ├── event-system.js       # Event System
│   ├── handlers/
│   │   ├── ability-handlers.js
│   │   ├── item-handlers.js
│   │   └── weather-handlers.js
│   ├── meta-teams.js         # メタチームテンプレート
│   └── selection-ai.js       # 選出AI
├── api/
│   ├── pokemon-api.js        # Poke API連携
│   └── cache.js              // JSONキャッシュ
└── rules/
    ├── stat-point-system.js  // 能力ポイントシステム
    ├── level50-system.js     // Lv.50固定
    └── mega-evolution.js     // メガシンカ
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
- [API仕様](docs/API.md)
- [エージェントインターフェース](docs/AGENT_INTERFACE.md)
- [実装済みアイテム](docs/IMPLEMENTED_ITEMS.md)

## 開発環境

- Node.js 18+
- Python 3.10+
- npm / pip

## ライセンス

MIT
