# 実装済みアイテム一覧

`BattleEngine`が実際に効果を処理している持ち物の一覧。
判定は`Pokemon.item`の文字列（PokeAPI準拠のkebab-case英名）で行う。

## 実装済み

### 回復系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| たべのこし | `leftovers` | 毎ターン終了時に最大HPの1/16回復 | `end-turn`ハンドラ |
| オボンのみ | `sitrus-berry` | HPが最大の1/2以下のとき最大HPの1/4回復（1回限り） | `end-turn`ハンドラ |

### 耐久系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| きあいのタスキ | `focus-sash` | HP満タンから瀕死になる攻撃をHP1で耐える（1回限り） | `apply-damage`ハンドラ |

### 強化系
| 道具 | ID | 効果 | 実装箇所 |
|------|-----|------|---------|
| いのちのたま | `life-orb` | 技の威力1.3倍 / ダメージを与えたターンのみ最大HPの1/10の反動 | `useMove` + `end-turn`ハンドラ |
| こだわりスカーフ | `choice-scarf` | 素早さ1.5倍 + 技固定 | `calculateSpeed` + `Pokemon.lockMove` |
| こだわりハチマキ | `choice-band` | 物理技の威力1.5倍 + 技固定 | `useMove` + `Pokemon.lockMove` |
| こだわりメガネ | `choice-specs` | 特殊技の威力1.5倍 + 技固定 | `useMove` + `Pokemon.lockMove` |

#### こだわり系の技固定について
- 技を出した時点で固定される（命中しなかった場合・特性で無効化された場合も固定される）
- 場を離れると解除される（通常交代・強制交代・pivot技による交代のいずれも`BattleSession.switchTo()`を通る）
- 固定中は`getLegalActions()`が該当技のみを返すため、`RandomBattleAgent`・LLMエージェント双方が自動的に従う

### メガストーン
`MegaEvolutionSystem`が担当。`MEGA_STONE_SEEDS`の静的テーブル、または
`MegaEvolutionSystem.fromPokeApi(api)`でPokeAPIから取得する。
メガシンカは技の選択に添えて宣言する（`MoveAction.megaEvolve`）。

## 未実装

| 道具 | ID | 効果 | 備考 |
|------|-----|------|------|
| ゴツゴツメット | `rocky-helmet` | 接触技を受けたとき相手に最大HPの1/6ダメージ | 接触技フラグが未実装 |
| とつげきチョッキ | `assault-vest` | 特防1.5倍 / 変化技を選べない | 合法手判定への追加が必要 |
| じゃくてんほけん | `weakness-policy` | 効果抜群を受けたとき攻撃・特攻+2 | |
| しめったいわ | `damp-rock` | あめふらしの持続を8ターンに延長 | 天候持続ターンが固定5のため |
| その他の半減実・こだわりトリック等 | | | |

---

#pokemon-champions #バトルエンジン #アイテム
