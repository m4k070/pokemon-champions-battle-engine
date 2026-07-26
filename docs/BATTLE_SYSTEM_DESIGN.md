# バトルシステム設計：Game Freak記事とPoke APIの統合

## 1. Game Freak記事からの知見

### 1.1 バトルシステムの定義

Game FreakのCEDEC2026講演（電ファミニコゲーマー記事）によると：

> 「バトルにおける事象を決定するシステム」
> 「プレイヤーが何をする？（入力）」と「入力に対して何が起きる？（出力）」の中間に位置する存在

### 1.2 構造化の重要性

記事から得られた重要な設計原則：

#### Section（セクション）
- わざ、とくせいといった個別の仕様を含まず「何をどの順番で計算するか」という処理の流れのみを定義
- 例: 「攻撃力を出すための計算をする」セクション（天気補正などの特殊ルールは含めない）

#### Event & Event Handler
- 各セクションは計算の要所でイベントを発生（発火）
- 「天気」「とくせい」「どうぐ」などのイベントハンドラーが反応し、補正を加える
- 個別仕様の実装はセクション本体から切り離される

### 1.3 階層構造

```
ダメージ計算セクション
├── 攻撃力セクション
├── 防御力セクション
└── ダメージ算出セクション

ダメージ付与セクション
├── ダメージ計算セクション
└── HP減少処理
```

### 1.4 連鎖と割り込み

例：せいでんき → まひ付与 → クラボのみ自動使用 → まひ治療

これらを「割り込み」と「連鎖」の挙動を再帰的に絡み合わせることで実現。

---

## 2. Poke APIからのデータ取得

### 2.1 利用可能なエンドポイント

| エンドポイント | データ | 例 |
|---|---|---|
| `/pokemon/{id}` | 種族値、タイプ、特性、技リスト | hippowdon: {HP: 108, ATK: 112, DEF: 118, SPATK: 68, SPDEF: 72, SPEED: 47} |
| `/type/{id}` | タイプ相性表 | ground vs fire: 2.0, vs water: 0.5, vs grass: 0.5 |
| `/move/{id}` | 技の詳細 | earthquake: {power: 100, accuracy: 100, pp: 10, type: "ground"} |
| `/ability/{id}` | 特性の詳細 | sand-stream: "Turns weather into sandstorm" |
| `/item/{id}` | 道具の詳細 | leftovers: "Restores 1/16 max HP each turn" |

### 2.2 実際のデータ例（カバルドン）

```json
{
  "name": "hippowdon",
  "stats": [
    {"base_stat": 108, "stat": {"name": "hp"}},
    {"base_stat": 112, "stat": {"name": "attack"}},
    {"base_stat": 118, "stat": {"name": "defense"}},
    {"base_stat": 68, "stat": {"name": "special-attack"}},
    {"base_stat": 72, "stat": {"name": "special-defense"}},
    {"base_stat": 47, "stat": {"name": "speed"}}
  ],
  "types": [
    {"type": {"name": "ground"}}
  ],
  "abilities": [
    {"ability": {"name": "sand-stream"}, "is_hidden": false},
    {"ability": {"name": "sand-force"}, "is_hidden": true}
  ]
}
```

### 2.3 Champions特有システムとの互換性

| データ | Poke API | Champions | 対応方針 |
|---|:---:|:---:|---|
| 種族値 | ✓ | ✓ | Poke APIから取得 |
| タイプ | ✓ | ✓ | Poke APIから取得 |
| タイプ相性 | ✓ | ✓ | Poke APIから取得 |
| 技データ | ✓ | ✓ | Poke APIから取得 |
| 個体値 | ✗ | 全31固定 | 使用しない |
| 努力値 | ✗ | 能力ポイント | 別途実装 |
| レベル | ✓ | Lv.50固定 | Lv.50で計算 |
| 特性 | ✓ | ✓ | Poke APIから説明文取得、実装は別途 |
| 道具 | ✓ | ✓ | Poke APIから説明文取得、実装は別途 |

---

## 3. 統合アプローチ

### 3.1 データフロー

```
Poke API
  ↓ 取得
基本データ（種族値、タイプ、技、特性、道具）
  ↓ 変換
Champions仕様データ
  ↓ 組み込み
バトルエンジン
  ↓ 実行
イベント & Event Handler
  ↓ 結果
対戦ログ
```

### 3.2 Section設計（Game Freak記事準拠）

#### ダメージ計算セクション
```javascript
calculateDamage(attacker, defender, move) {
  // 1. 攻撃力セクション
  const attack = this.calculateAttack(attacker, move);
  
  // 2. 防御力セクション
  const defense = this.calculateDefense(defender, move);
  
  // 3. ダメージ算出セクション
  const baseDamage = this.calculateBaseDamage(attack, defense, move);
  
  // 4. 補正セクション（イベント発火）
  const finalDamage = this.applyModifiers(baseDamage, attacker, defender, move);
  
  return finalDamage;
}
```

#### イベント発火ポイント
```javascript
// 攻撃力計算時
emit('calculate-attack', { attacker, move });
// → いかく、こだわりハチマキ等のハンドラーが反応

// ダメージ算出時
emit('calculate-damage', { attacker, defender, move });
// → 天気、特性、道具等のハンドラーが反応

// ダメージ付与時
emit('apply-damage', { defender, damage });
// → きあいのタスキ、オボンのみ等のハンドラーが反応
```

### 3.3 Event Handler実装例

#### 特性ハンドラー
```javascript
class AbilityHandler {
  handleSandStream(pokemon, event) {
    // すなおこし: 場に出た時に砂嵐を発生
    if (event.type === 'switch-in' && pokemon.ability === 'sand-stream') {
      event.engine.weather = 'sand';
      event.engine.weatherTurnsLeft = 5;
    }
  }
  
  handleIntimidate(pokemon, event) {
    // いかく: 場に出た時に相手の攻撃を下げる
    if (event.type === 'switch-in' && pokemon.ability === 'intimidate') {
      const opponent = event.engine.getOpponent(pokemon);
      opponent.stats.ATK = Math.floor(opponent.stats.ATK * 0.7);
    }
  }
}
```

#### 道具ハンドラー
```javascript
class ItemHandler {
  handleLeftovers(pokemon, event) {
    // たべのこし: 毎ターン最大HPの1/16回復
    if (event.type === 'end-turn' && pokemon.item === 'leftovers') {
      const heal = Math.floor(pokemon.maxHP / 16);
      pokemon.heal(heal);
    }
  }
  
  handleFocusSash(pokemon, event) {
    // きあいのタスキ: HP満タン時に1発耐える
    if (event.type === 'apply-damage' && 
        pokemon.item === 'focus-sash' && 
        !pokemon.itemUsed && 
        pokemon.currentHP === pokemon.maxHP) {
      pokemon.currentHP = 1;
      pokemon.itemUsed = true;
    }
  }
}
```

---

## 4. 実装方針

### 4.1 Phase 1: Poke API連携（データ取得）

1. **ポケモンデータ取得モジュール**
   - `/pokemon/{id}` から種族値、タイプ、特性、技リストを取得
   - JSON形式でローカルキャッシュ

2. **技データ取得モジュール**
   - `/move/{id}` から威力、命中、PP、カテゴリ、タイプを取得
   - JSON形式でローカルキャッシュ

3. **タイプ相性取得モジュール**
   - `/type/{id}` からタイプ相性表を取得
   - JSON形式でローカルキャッシュ

### 4.2 Phase 2: バトルエンジン（Section設計）

1. **Section実装**
   - ダメージ計算セクション
   - 攻撃力セクション
   - 防御力セクション
   - ダメージ付与セクション
   - 状態異常セクション

2. **Event System実装**
   - イベント発火機能
   - イベントハンドラー登録機能
   - 連鎖・割り込み処理

### 4.3 Phase 3: Event Handler実装

1. **特性ハンドラー**
   - 主要な特性（すなおこし、いかく、へんげんじざい等）の実装

2. **道具ハンドラー**
   - 主要な道具（たべのこし、オボンのみ、きあいのタスキ、こだわりスカーフ等）の実装

3. **天気ハンドラー**
   - 雨、晴れ、砂嵐、霰の実装

### 4.4 Phase 4: Champions固有ルール

1. **能力ポイントシステム**
   - 1能力最大32、合計66の実装

2. **Lv.50固定**
   - 実数値計算をLv.50に最適化

3. **メガシンカ仕様**
   - メガストーン、メガシンカの優先度等の実装

---

## 5. メリット

### 5.1 データソースとしてのPoke API

- ✓ 最新データが常に利用可能
- ✓ 手動でのデータ入力不要
- ✓ タイプ相性表の完全な取得
- ✓ 技、特性、道具の説明文取得

### 5.2 Game Freak記事の設計原則

- ✓ 保守性の向上（Section分離）
- ✓ 拡張性の向上（Event Handler追加）
- ✓ 柔軟性の向上（連鎖・割り込み対応）
- ✓ 再利用性の向上（Sectionの組み合わせ）

### 5.3 統合による相乗効果

- Poke APIでデータを取得 → 手動入力の手間を削減
- Game Freakの設計原則で実装 → 保守性・拡張性を確保
- Champions固有ルールを組み込む → 正確なシミュレーション

---

## 6. 今後の課題

1. **Poke APIからChampionsデータの直接取得**
   - 現在: Poke APIは本編シリーズのデータ
   - 課題: Champions固有データ（技変更、特性変更等）の対応
   - 解決策: 手動でChampions仕様を上書きする仕組み

2. **Event Handlerの網羅性**
   - 課題: 300種類以上の特性、200種類以上の道具の実装
   - 解決策: 主要なものを優先的に実装、順次追加

3. **パフォーマンス**
   - 課題: Poke APIからのリアルタイム取得は遅い
   - 解決策: ローカルキャッシュ、バッチ処理

---

#pokemon-champions #バトルエンジン #設計 #PokeAPI #GameFreak

