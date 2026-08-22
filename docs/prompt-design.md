# テストプレイ用プロンプト設計

## 現状（冗長）
```
ターンN。あなたは[ポケモン名](HPxxx/yyy)。相手は[ポケモン名](HPxxx/yyy)。[技名]が来る。どうする？
```

## 改善後（簡潔）
```
T{ターン}: {自分のポケモン}({HP}/{maxHP} {タイプ}) vs {相手のポケモン}({HP}/{maxHP} {タイプ})
状態: {状態異常があれば}
行動: {type: "move", moveIndex: N} or {type: "switch", pokemonIndex: N}
```

## 例
```
T3: カバルドン(25/183 ground) vs ラグラージ(180/180 water/ground)
行動: {"action": {"type": "switch", "pokemonIndex": 1}, "reasoning": "理由"}
```

## ルール
1. 技名は聞かない（判断はmoonに任せる）
2. 控えのポケモンは必要最小限のみ（名前+HP+タイプ）
3. 状態異常・天气は簡潔に
4. JSONフォーマットを指定
