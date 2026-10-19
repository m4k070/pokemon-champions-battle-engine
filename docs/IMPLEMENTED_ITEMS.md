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

## ダメージ計算（乱数・急所）

| 項目 | 状態 | 実装箇所 |
|------|------|---------|
| 乱数（0.85〜1.00の16段階・ヒットごと） | 実装済み（2026-10-18 T0） | `BattleEngine.rollDamageFactor()` / `rollDamage()`（乱数列は注入済みの`rng`経由。seed固定で再現可） |
| 急所（1/24・1.5倍・壁と不利ランクを無視・最低1ダメージ） | 実装済み（2026-10-18 T0） | `BattleEngine.rollCriticalHit()` / `applyModifiers()` / `calculateAttack()` / `calculateDefense()`。テスト: `tests/damage-variance.test.ts` |
| 急所無効（シェルアーマー） | 実装済み | `AbilityDefinition.preventsCriticalHits` |
| 急所ランク（きょううん・するどいツメ・高急所技） | 未実装 | 出典: champions.pokewiki.net「ダメージ計算式」（ランク0=1/24、+1=1/8、+2=1/2、+3=1/1） |
| カブトアーマー | 未実装 | 特性名がレジストリ未登録のため |

## 技の効果（あくび・なまける）

| 技 | 効果 | 実装箇所 |
|------|------|---------|
| あくび | 相手を「ねむけ」にし、次のターンの終了時に「ねむり」にする。交代で解除。必ず命中 | `useMove`（`inflictsDrowsy`）→ `applyDrowsySleep`（`endTurn` から呼ぶ）→ `BattleRunner.switchTo` の `resetDrowsy`。テスト: `tests/status-state.test.ts` |
| なまける | 自分のHPを最大HPの1/2回復。HPが満タンなら効果なし（`no-effect` / `full-hp`） | `useMove`（`selfHealPercent`）。テスト: `tests/status-state.test.ts` |
| こわいかお | 相手のすばやさランクを2段階下げる（下限 -6） | `applyTargetStatChange`（`targetStatChange`）。テスト: `tests/stat-stages.test.ts` |
| てっぺき | 自分のぼうぎょランクを2段階上げる | `applySelfStatChange`（`selfStatChange`）。テスト: `tests/stat-stages.test.ts` |
| ボディプレス | ダメージ計算に「こうげき」ではなく「ぼうぎょ」とその能力ランクを使う。やけどでも半減しない | `calculateAttack`（`usesDefenseForAttack`）。テスト: `tests/stat-stages.test.ts` |
| かげうち | 優先度+1のゴースト物理技（解決順は既存の優先度ソートに載る） | `battle-runner` の優先度ソート。テスト: `tests/priority-and-encore.test.ts` |
| アンコール | 相手が直前に使った技を3ターン固定する（交代で解除。直前の技が無ければ失敗） | `useMove`（`inflictsEncore`）→ `Pokemon.applyEncore` / `canUseMove` / `startTurn` の期限解除。テスト: `tests/priority-and-encore.test.ts` |
| サイコフィールド | 5ターン（グランドコートで8ターン）フィールドを展開。接地している側のエスパー技を1.3倍、接地している相手への先制技を無効化 | `useMove`（`fieldEffect: 'psychic-terrain'`）+ `isGrounded` + 威力補正 + 先制技の無効化。テスト: `tests/terrain.test.ts` |
| ワイドフォース | サイコフィールド下で接地していれば威力1.5倍（フィールドの1.3倍も重なる） | `calculateAttack` 手前の威力補正（`boostedByPsychicTerrain`）。テスト: `tests/terrain.test.ts` |

### メガシンカ（Champions 独自）

| メガ | ストーン | タイプ / 特性 / 種族値 | テスト |
|------|---------|----------------------|--------|
| メガガブリアスZ | `garchompite-z` | ドラゴン単 / ふゆう / 108-130-85-141-85-151 | `tests/mega-evolution.test.ts` |

**注意**: 本編のメガガブリアス（`garchompite` → `mega-garchomp`・dragon/ground・すなのちから・S-10）とは別物。両方のテストで取り違えを防いでいる。

出典: yakkun.com（ポケモンチャンピオンズ図鑑）の技説明。

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
