# バトルエンジン v2.0

## 概要

Game FreakのCEDEC2026記事とPoke APIを統合した、ポケモンチャンピオンズ用バトルシミュレーションエンジン。

## 機能

### Step 1: Poke API連携モジュール
- ✓ Poke API データ取得モジュール実装
- ✓ JSONキャッシュ機能追加

### Step 2: Section設計バトルエンジン
- ✓ Section設計の実装（Game Freak記事準拠）
- ✓ Event Systemの実装

### Step 3: Event Handler実装
- ✓ 主要な特性の実装（すなおこし、いかく、へんげんじざい等）
- ✓ 主要な道具の実装（たべのこし、オボンのみ、きあいのタスキ、こだわりスカーフ等）
- ✓ 天気ハンドラーの実装（砂嵐、雨、晴れ）

### Step 4: Champions固有ルール
- ✓ 能力ポイントシステム（1能力最大32、合計66）
- ✓ Lv.50固定実装
- ✓ メガシンカ仕様

## ファイル構成

```
08-バトルエンジン/
├── battle_engine_v2.js          # 完全なバトルエンジン実装
├── BATTLE_SYSTEM_DESIGN.md      # 設計ドキュメント
└── README.md                    # このファイル
```

## 使い方

### 基本的な使用例

```javascript
const { PokemonAPI, BattleEngine, Pokemon, PokemonDataCache } = require('./battle_engine_v2.js');

// キャッシュ作成
const cache = new PokemonDataCache();
const api = new PokemonAPI(cache);

// Poke APIからポケモンデータを取得
const hippowdonData = await api.fetchPokemonData(450);

// ポケモン作成
const hippowdon = new Pokemon({
  name: hippowdonData.name,
  types: hippowdonData.types,
  ability: hippowdonData.abilities[0].name,
  item: null,
  stats: hippowdonData.baseStats,
  moves: []
});

// バトルエンジン作成
const engine = new BattleEngine();

// 交代
engine.switchIn(hippowdon, [hippowdon]);
```

### 能力ポイントシステム

```javascript
const { StatPointSystem } = require('./battle_engine_v2.js');

const statSystem = new StatPointSystem();

// 能力ポイント配分
const statPoints = {
  HP: 0,
  ATK: 0,
  DEF: 32,  // 最大32
  SPATK: 0,
  SPDEF: 0,
  SPEED: 32  // 最大32
};

// 実数値計算（Lv.50固定）
const stats = statSystem.calculateStats(baseStats, statPoints);
// => { HP: 183, ATK: 132, DEF: 142, SPATK: 88, SPDEF: 92, SPEED: 71 }
```

### メガシンカ

```javascript
const { MegaEvolutionSystem } = require('./battle_engine_v2.js');

const megaSystem = new MegaEvolutionSystem();

// メガシンカ可能かチェック
if (megaSystem.canMegaEvolve(charizard)) {
  megaSystem.megaEvolve(charizard);
  // => メガリザードンXに進化
}
```

## アーキテクチャ

### Section設計（Game Freak記事準拠）

```
ダメージ計算セクション
├── 攻撃力セクション
├── 防御力セクション
├── ダメージ算出セクション
└── ダメージ補正セクション

ダメージ付与セクション
├── ダメージ計算セクション
└── HP減少処理
```

### Event System

```javascript
// イベント発火
engine.events.emit('switch-in', { pokemon, engine });
engine.events.emit('end-turn', { team, engine });
engine.events.emit('apply-damage', { defender, damage, engine });

// イベントハンドラー登録
engine.events.on('switch-in', (data) => {
  // 特性発動処理
});
```

## 実装済みEvent Handler

### 特性
- すなおこし: 場に出た時に砂嵐を発生（5ターン）
- あめふらし: 場に出た時に雨を発生（5ターン）
- ひでり: 場に出た時に晴れを発生（5ターン）
- ゆきげしき: 場に出た時に霰を発生（5ターン）
- いかく: 場に出た時に相手の攻撃を下げる
- へんげんじざい: 技に応じてタイプを変化

### 道具
- たべのこし: 毎ターン最大HPの1/16回復
- いのちのたま: 技の威力1.3倍、毎ターン最大HPの1/10ダメージ
- オボンのみ: HPが25%以下になった時に最大HPの1/2回復（1回限り）
- きあいのタスキ: HP満タン時に1発耐える（1回限り）
- こだわりスカーフ: 素早さ1.5倍、最初に選んだ技に固定

### 天気
- 砂嵐: 岩、地面、鋼タイプ以外は砂ダメージ、岩タイプは特防1.5倍
- 雨: 水技1.5倍、炎技0.5倍
- 晴れ: 炎技1.5倍、水技0.5倍

## Champions固有ルール

### 能力ポイントシステム
- 1能力最大: 32ポイント
- 合計上限: 66ポイント
- 個体値: 全廃止（全31扱い）

### Lv.50固定
- レベル: Lv.50固定
- 実数値計算: Lv.50に最適化

### メガシンカ
- メガストーン: リザードナイトX/Y、ガブリアスナイト等
- メガシンカ仕様: 優先度+1、種族値上昇、特性変更

## Poke API連携

### 取得可能なデータ
- ✓ 種族値、タイプ、特性、技リスト
- ✓ タイプ相性表（18タイプ全て）
- ✓ 技の詳細（威力、命中、PP、カテゴリ）
- ✓ 特性・道具の効果説明文

### キャッシュ機能
- JSON形式でキャッシュ
- 重複取得を回避
- 手動でキャッシュクリア可能

## メリット

1. **データソース**: Poke APIで最新データを自動取得
2. **保守性**: Game FreakのSection設計でコードの見通しが良い
3. **拡張性**: Event Handler追加で新しい特性・道具を容易に実装
4. **正確性**: Champions固有ルールを組み込むことで正確なシミュレーション

## 今後の課題

1. **Champions固有データ**: Poke APIは本編シリーズのデータのため、技変更・特性変更は手動で上書きが必要
2. **Event Handlerの網羅性**: 300種類以上の特性、200種類以上の道具を順次実装
3. **パフォーマンス**: Poke APIからのリアルタイム取得は遅いため、ローカルキャッシュが必要

## 参考資料

- [CEDEC2026『ポケモン』バトルシステム講演](https://news.denfaminicogamer.jp/kikakuthetower/2607224z)
- [Poke API](https://pokeapi.co/)
- [BATTLE_SYSTEM_DESIGN.md](./BATTLE_SYSTEM_DESIGN.md)

---

#pokemon-champions #バトルエンジン #v2

