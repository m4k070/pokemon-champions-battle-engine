# エージェント向けバトルエンジンインターフェース

## 概要

このドキュメントは、AIエージェントがバトルエンジンと対話するためのインターフェースを説明します。

**重要な設計原則**:
- エージェントは「技を選ぶ」「交代する」といった**人間のプレイヤーと同等の操作**のみを実行
- 実際の処理（ダメージ計算、状態異常、天候変化、特性発動等）はバトルエンジンが担当
- エージェントはゲームシステムの内部ロジックを理解する必要がない

## アーキテクチャ

```
┌─────────────────┐
│  AIエージェント  │
└────────┬────────┘
         │ 選択操作のみ
         ↓
┌─────────────────┐
│ バトルエンジン  │
│ (battle_engine) │
└────────┬────────┘
         │ 処理結果
         ↓
┌─────────────────┐
│   バトルログ    │
└─────────────────┘
```

## エージェントの役割

エージェントが実行する操作は以下の3つだけです：

### 1. 技の選択

```javascript
// エージェントの選択
const action = {
  type: 'move',
  moveIndex: 0,        // 技のインデックス（0-3）
  target: 'opponent'   // 対象（'opponent' or 'ally'）
};

// バトルエンジンが実行
const result = engine.useMove(attacker, defender, attacker.moves[action.moveIndex]);
```

### 2. 交代

```javascript
// エージェントの選択
const action = {
  type: 'switch',
  pokemonIndex: 1  // 控えポケモンのインデックス
};

// バトルエンジンが実行
const newActive = engine.switchIn(team[action.pokemonIndex], team);
```

### 3. 降参

```javascript
// エージェントの選択
const action = {
  type: 'forfeit'
};

// バトルエンジンが実行（実装予定）
engine.handleForfeit(team);
```

### 補足: 技を選べず交代だけを選ぶ場面

以下の2つの場面では、エージェントは技を選べず `type: 'switch'` だけを返す必要があります。
`BattleContext.mustSwitch` が `true` になり、`getLegalActions()` も技を返しません。

| 場面 | 判定 |
|------|------|
| 瀕死による強制交代 | `session.needsForcedSwitch(side)` |
| pivot技（とんぼがえり等）の攻撃後交代 | `session.needsPivotSwitch(side)` |

pivot技の場合は**技の解決後に問い合わせが来る**ため、ダメージ量・撃破の有無・
（自分が後攻なら）相手の行動を見たうえで退場先を選べます。
`session.isTurnComplete()` が `true` になるまで `applyPivotSwitch()` を呼び続けてください。

## バトルエンジンの役割

バトルエンジンが自動的に処理する項目：

### 1. 特性の自動発動
```javascript
// カバルドンが場に出た時
engine.switchIn(kabaldon, team);
// → 特性「すなおこし」により砂嵐が発生
// → エージェントは「すなあらし」を選ぶ必要がない
```

### 2. ダメージ計算
```javascript
// 技の威力、タイプ相性、天候ボーナス等を自動計算
const { damage, effectiveness } = engine.calculateDamage(attacker, defender, move);
```

### 3. 状態異常の効果
```javascript
// 火傷、毒、眠り等の効果を自動適用
engine.applyStatusEffects(team);
// → 火傷ダメージ、毒ダメージ、眠り判定等を自動処理
```

### 4. 天候の管理
```javascript
// 天候の発生、終了を自動管理
engine.startTurn();
// → 天候ターン経過、トリックルーム終了判定
```

### 5. 速度判定
```javascript
// トリックルーム考慮の速度判定
const speedA = engine.calculateSpeed(pokemonA);
const speedB = engine.calculateSpeed(pokemonB);
// → 速度順に行動を実行
```

## エージェント向けプロンプト例

### シンプル版（推奨）

```
あなたはポケモンチャンピオンのプレイヤーです。

【状況】
- 自軍: カバルドン (HP: 640/682, 火傷)
- 相手: ウインディ (HP: 79/215)
- 天候: 砂嵐 (残り4ターン)
- ターン: 2

【選択】
以下の技から1つ選んでください：
1. じしん (タイプ: じめん, 威力: 100)
2. あくび (タイプ: ノーマル, 変化技)
3. こおりのキバ (タイプ: こおり, 威力: 65)

行動: 「技: [技名]」または「交代: [ポケモン名]」
```

### 詳細版

```
あなたはポケモンチャンピオンのプレイヤーです。

【自軍】
- カバルドン (HP: 640/682, 状態異常: 火傷)
  - 特性: すなおこし
  - 技: じしん, あくび, こおりのキバ, まもる

【相手】
- ウインディ (HP: 79/215)
  - 特性: いかく
  - 技: バークアウト, じだんだ, おにび, あさのひざし

【控え】
- 自軍: ヌメルゴン (HP: 506/506), メガリザX (HP: 412/412)
- 相手: ドラパルト (HP: 328/328)

【フィールド】
- 天候: 砂嵐 (残り4ターン)
- ターン: 2

【選択】
以下の行動から1つ選んでください：
1. じしん
2. あくび
3. こおりのキバ
4. まもる
5. ヌメルゴンに交代
6. メガリザXに交代

行動: 「技: [技名]」または「交代: [ポケモン名]」
```

## エージェントが理解すべき最小限の知識

エージェントが理解する必要があるのは以下の3つだけです：

### 1. タイプ相性の基本
- ほのお → くさ、こおり、むし、はがね（効果抜群）
- みず → ほのお、じめん、いわ（効果抜群）
- でんき → みず、ひこう（効果抜群）
- くさ → みず、じめん、いわ（効果抜群）

### 2. 状態異常の効果
- 火傷: 物理攻撃半減、毎ターンダメージ
- 毒: 毎ターンダメージ
- 眠り: 行動不能（1-3ターン）
- 麻痺: 速度半減

### 3. 戦略の基本
- 不利なタイプ対面では交代
- 状態異常を撒いて相手の火力を低下
- 積み技で火力を増強

## エージェントが理解する必要がないこと

エージェントが理解する必要がない項目：

- ✗ ダメージ計算式
- ✗ 実数値の計算方法
- ✗ 特性の詳細な効果（「すなおこしで砂嵐が発生する」等は自動処理）
- ✗ 天候のターン管理
- ✗ PPの管理（簡易版）
- ✗ 乱数の処理

## 実装例

### JavaScript版

```javascript
const { Pokemon, BattleEngine } = require('./battle_engine.js');

// ポケモンデータの定義
const kabaldonData = {
  name: 'カバルドン',
  types: ['じめん'],
  ability: 'すなおこし',
  stats: { HP: 263, ATK: 135, DEF: 195, SPATK: 75, SPDEF: 135, SPEED: 65 },
  moves: [
    { name: 'じしん', type: 'じめん', power: 100, accuracy: 100, pp: 10, maxPP: 10, category: 'physical' },
    { name: 'あくび', type: 'ノーマル', power: 0, accuracy: 100, pp: 10, maxPP: 10, category: 'status', status: 'sleep' }
  ]
};

// ポケモン生成
const kabaldon = new Pokemon(kabaldonData);

// バトルエンジン初期化
const engine = new BattleEngine();

// バトル開始
engine.startTurn();
engine.switchIn(kabaldon, [kabaldon]); // 特性「すなおこし」自動発動

// エージェントの選択
const agentAction = { type: 'move', moveIndex: 0 }; // じしん

// バトルエンジンが実行
const result = engine.useMove(kabaldon, opponent, kabaldon.moves[agentAction.moveIndex]);
```

### Python版

```python
from battle_engine import Pokemon, BattleEngine

# ポケモンデータの定義
kabaldon_data = {
    'name': 'カバルドン',
    'types': ['じめん'],
    'ability': 'すなおこし',
    'stats': {'HP': 263, 'ATK': 135, 'DEF': 195, 'SPATK': 75, 'SPDEF': 135, 'SPEED': 65},
    'moves': [
        {'name': 'じしん', 'type': 'じめん', 'power': 100, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'physical'},
        {'name': 'あくび', 'type': 'ノーマル', 'power': 0, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'status', 'status': 'sleep'}
    ]
}

# ポケモン生成
kabaldon = Pokemon(kabaldon_data)

# バトルエンジン初期化
engine = BattleEngine()

# バトル開始
engine.start_turn()
engine.switch_in(kabaldon, [kabaldon])  # 特性「すなおこし」自動発動

# エージェントの選択
agent_action = {'type': 'move', 'moveIndex': 0}  # じしん

# バトルエンジンが実行
result = engine.use_move(kabaldon, opponent, kabaldon.moves[agent_action['moveIndex']])
```

## メリット

### 1. エージェントの簡素化
- プロンプトが短くなる（ゲームシステムの説明不要）
- エラーが減る（ルール誤解による不自然な行動なし）
- 意思決定に集中できる

### 2. 正確性の保証
- ダメージ計算が正確
- 状態異常の効果が正確
- 天候の管理が正確
- 特性の発動が正確

### 3. 拡張性
- 新しい特性を追加してもエージェントのプロンプト変更不要
- 新しい技を追加してもエージェントのプロンプト変更不要
- ルール変更があってもエージェントには影響しない

## 今後の課題

### 優先度高
- [ ] エージェントとバトルエンジンの連携API
- [ ] 複数ターン自動進行
- [ ] 勝敗判定

### 優先度中
- [ ] 持ち物の効果
- [ ] 追加効果の処理
- [ ] 優先度の処理

### 優先度低
- [ ] ダメージ乱数の実装
- [ ] バトンパスの処理
- [ ] フィールド技の処理

---

#pokemon-champions #バトルエンジン #エージェントインターフェース

