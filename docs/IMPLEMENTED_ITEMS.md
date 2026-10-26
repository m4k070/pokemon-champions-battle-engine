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

## 構築カタログ（`src/data/meta-teams.ts`）

構築データ（上位構築の6体・持ち物・技・能力ポイント）はエンジンに含めない。エンジンは型と変換だけを持つ。

| 関数 | 役割 |
|------|------|
| `loadMetaTeams(path)` | 構築カタログの JSON（`MetaTeamEntry[]`、技は `MoveInput`）を読み、技を `createMove` で作り直す |
| `toPokemon` / `teamToPokemons` | カタログの1体・1構築を `Pokemon` にする（能力ポイントと性格補正を反映） |
| `setDefaultBeliefTeams(teams)` | 不完全情報で使う既定の信念（相手の型の候補）の元になる構築プールを登録する。未登録なら信念は空 |

**PPの複製**: `BattleEngine` は使用時に `move.pp -= 1` で技オブジェクトを書き換える。カタログの `moves` をそのまま渡すと、同じ構築のミラー対戦で左右が同じ技オブジェクトを共有してPPが二重に減り、試合が終わらなくなる。`toPokemon` は `cloneMove` で複製する。

## 特性（追加分）

| 特性 | 効果 | 実装箇所 |
|------|------|---------|
| サイコメイカー | 入場時にサイコフィールドを展開（5ターン。グランドコート持ちなら8ターン） | `rules/abilities/meta-abilities.ts` の `PSYCHIC_SURGE` |
| ばけのかわ | Champions仕様（第8世代以降準拠）。1回だけ技のダメージを無効化して最大HPの1/8を受け、フォルムチェンジする。交代で復活しない（バトル中1回きり）。タイプ無効の技では発動せず、ステロ・変化技・追加効果は防がない | `DISGUISE`（`onDamaged`）+ `Pokemon.disguiseBroken` + `BattleEngine.applyDamage`（実ダメージを返す） |
| おうごんのからだ | 相手からの変化技を無効化（ダメージ技は通る） | `GOOD_AS_GOLD`（`blocksMove`） |
| クリアボディほか13種 | 名前のみ登録（効果は未実装） | `ability-names.ts` |

**gamewith 最強パーティランキング（2026-10-19 取得）の11構築に登場する特性37種をすべて登録済み**（`tests/ability-coverage.test.ts` と `tests/meta-teams.test.ts` で固定）。内訳は「未実装の特性・技の棚卸し」を参照。

2026-10-19 に追加した特性名: `volt-absorb`（ちくでん）・`thermal-exchange`（ねつこうかん）・`flower-veil`（フラワーベール）・`fairy-aura`（フェアリーオーラ）・`tobidasu-nakami`（とびだすなかみ・メガウツボット、英語名未公開のためローマ字キー）。いずれも名前だけの登録。

## 技の効果（現環境の構築で使われるもの）

| 技 | 効果 | 実装 |
|----|------|------|
| みがわり | 最大HPの1/4を払って身代わりを出す。ダメージは身代わりが受ける。残りHPが代償以下なら失敗。交代で消える | `createsSubstitute` / `Pokemon.substituteHP` |
| くろいきり | 場に出ている全員の能力変化をリセットする | `resetsStatStages` |
| ドレイン技（きゅうけつ・ギガドレイン・むねんのつるぎ等） | 与えたダメージの50%を回復する | `drainPercent` |
| まもる | そのターン相手の技を無効化。連続使用は成功率が半減（1.0→0.5→…） | `protects` / `Pokemon.protecting` |
| ねむる | HP全回復＋2ターンのねむり。HP満タン・状態異常ありでは失敗 | `rests` / `Pokemon.applySleep` |
| 反動（ウェーブタックル・てっていこうせん等） | 与えたダメージの割合、または最大HPの割合を自分も受ける | `recoilPercent` / `recoilMaxHpPercent` |
| ふいうち | 相手がそのターン攻撃技を選んでいなければ失敗 | `failsUnlessTargetAttacks` / `intendsToAttackThisTurn` |
| イカサマ | ダメージ計算に相手のこうげきを使う | `usesTargetAttack` |
| くさむすび・けたぐり | 威力が相手の体重で決まる（20〜120） | `weightBasedPower` / `Pokemon.weightKg` |
| はたきおとす | 落とせる持ち物を持つ相手には威力1.5倍、命中後に落とす（メガストーンは不可） | `knockOff` / `isMegaStone` |
| ポルターガイスト | 相手が持ち物を持っていなければ失敗 | `failsIfNoItem` |
| ダメおし | そのターン既に相手がダメージを受けていれば威力2倍 | `doublesIfTargetDamaged` |
| トリックフラワー | 必ず急所（シェルアーマー等が優先） | `alwaysCrit` |
| オーロラベール | 5ターンの間、張られた側が受けるダメージを半減 | `fieldEffect: 'aurora-veil'` |
| ねがいごと | 2ターン後に場に出ているポケモンを最大HPの半分回復 | `wishes` / `BattleField.wish` |
| ミストフィールド | 5ターン展開。接地側は状態異常無効＋ドラゴン技半減 | `fieldEffect: 'misty-terrain'` |
| ほえる・ドラゴンテール | 相手を控えと強制交代させる（無作為） | `forcesSwitch` / `BattleRunner.applyForcedOutSwitch` |
| ひるみ | `flinchChance`（%）。先に当てたときだけ、相手はそのターン動けない。みがわり・せいしんりょくで防ぐ | `BattleEngine.flinchedThisTurn` |
| ミラーコート | そのターンに受けた特殊ダメージの2倍を返す。受けていなければ失敗、あくタイプには無効 | `reflectsSpecialDamage` |
| ねばねばネット | 相手の場に設置。出てきた接地ポケモンの素早さ-1 | `fieldEffect: 'sticky-web'` / `BattleField.stickyWeb` |
| いやしのねがい | 自分が倒れ、次にその側の場に出たポケモンのHPと状態異常を回復。控えがいなければ失敗 | `healingWish` / `BattleField.healingWish` |
| ゆきなだれ | そのターン先に攻撃を受けていれば威力2倍 | `doublesIfHitFirst` |
| フリーズドライ | みずタイプに効果抜群 | `superEffectiveOnWater` |
| ちょうはつ | 相手を3ターンの間、変化技を使えなくする（選べない・出しても失敗）。みがわりを貫通。メンタルハーブで1回解除。以前は攻撃技を封じる逆の判定で、かける技も無かった | `inflictsTaunt` / `Pokemon.canUseMove` |
| おはかまいり | 倒れている味方1体につき威力+50 | `powerPerFaintedAlly` / `BattleEngine.teamOf` |
| グラスフィールド | 5ターン展開（グラスメイカー・こぼれダネ）。接地側のくさ技1.3倍、接地している相手へのじしん・じならし半減、ターン終了時に接地側を1/16回復 | `BattleEngine.applyGrassyTerrainHeal` / `GRASSY_SURGE` |
| グラススライダー | グラスフィールドで使用者が接地していれば優先度+1 | `priorityInGrassyTerrain` / `BattleEngine.movePriority` |

**まきびし・どくびしは `fieldEffect`（'spikes' / 'toxic-spikes'）として実装済み**（前の記録で未実装と書いていたのは誤り）。

**残っている主な未実装の技効果**（pokesol M-4 トップ5が使う技80件から抽出）: サイコショック（特殊技なのに相手のぼうぎょで計算）、サイコファング（壁を壊す）、パワフルエッジ（まもるを貫通）、フリーズドライ（みずに抜群）、ヘビーボンバー（体重比で威力）、うたかたのアリア（相手のやけどを治す）、クリアスモッグ（相手の能力変化をリセット）、じごくづき（音技を封じる）、トリック（持ち物の交換）。

**タイプ強化の持ち物**: くろいメガネ（あく）・りゅうのキバ（ドラゴン）・しんぴのしずく（みず）・のろいのおふだ（ゴースト）は、対応するタイプの技の威力1.2倍（`TYPE_BOOST_ITEMS`）。**ひかりのねんど**: リフレクター・オーロラベールを8ターンにする（ひかりのかべは技そのものが未実装）。

**特性（2026-10-26 追加）**: きれあじ（切る技1.5倍。切る技は名前の一覧で判定）、すいほう（みず技2倍・受けるほのお技半減・やけど無効）。

**メガシンカ（2026-10-26 追加、出典は Bulbapedia）**: メガユキメノコ（`froslassite`・こおり/ゴースト・ゆきふらし）、メガアブソルZ（`absolite-z`・あく/ゴースト・きれあじ）、メガムクホーク（`staraptite`・かくとう/ひこう・あまのじゃく）。

**ゴツゴツメット（`rocky-helmet`）**: 接触技を受けたとき、攻撃者に攻撃者の最大HPの1/6。接触は技の `contact` で判定する（カタログ側で付ける。PokeAPI に接触の情報が無いため）。同じ理由で、さめはだ・かたいツメ・はどうのぼうごも `contact` を付けたカタログでだけ効く。さめはだの反撃は、以前は自分の最大HPの1/8で計算していたのを、攻撃者の最大HPの1/8に直した。

**天候「ゆき」**: チャンピオンズの天候は SV 以降と同じゆき（`'snow'`）。毎ターンのダメージは無く、こおりタイプのぼうぎょ1.5倍、ふぶき必中、オーロラベールはゆきの間だけ張れる。すなあらしは いわタイプのとくぼう1.5倍。

**ふうせん（`air-balloon`）**: 割れるまでじめん技が当たらず（失敗理由 `blocked-by-item`）、接地していない扱い（フィールドの効果・まきびし・どくびしを受けない）。ダメージ技を受けると割れる（みがわりが受けたときは割れない）。方策の見積もり（`damageRatio`）は、相手の持ち物が見えない場合があるため、ふうせんを考えていない。

## 未実装

| 道具 | ID | 効果 | 備考 |
|------|-----|------|------|
| とつげきチョッキ | `assault-vest` | 特防1.5倍 / 変化技を選べない | 合法手判定への追加が必要 |
| じゃくてんほけん | `weakness-policy` | 効果抜群を受けたとき攻撃・特攻+2 | |
| しめったいわ | `damp-rock` | あめふらしの持続を8ターンに延長 | 天候持続ターンが固定5のため |
| その他の半減実・こだわりトリック等 | | | |

---

#pokemon-champions #バトルエンジン #アイテム
