"""
サンプルバトル：妖竜 vs 状態異常撒きPT

このスクリプトは、バトルエンジンの動作を確認するためのサンプルです。
"""

import random
from battle_engine import Pokemon, BattleEngine

# ポケモンデータの定義
kabaldon_data = {
    'name': 'カバルドン',
    'types': ['じめん'],
    'ability': 'すなおこし',
    'item': 'ゴツゴツメット',
    'stats': {'HP': 263, 'ATK': 135, 'DEF': 195, 'SPATK': 75, 'SPDEF': 135, 'SPEED': 65},
    'level': 50,
    'moves': [
        {'name': 'じしん', 'type': 'じめん', 'power': 100, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'physical'},
        {'name': 'あくび', 'type': 'ノーマル', 'power': 0, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'status', 'status': 'sleep'},
        {'name': 'こおりのキバ', 'type': 'こおり', 'power': 65, 'accuracy': 95, 'pp': 15, 'maxPP': 15, 'category': 'physical'},
        {'name': 'まもる', 'type': 'ノーマル', 'power': 0, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'status'}
    ]
}

windy_data = {
    'name': 'ウインディ',
    'types': ['ほのお'],
    'ability': 'いかく',
    'item': 'オボンのみ',
    'stats': {'HP': 215, 'ATK': 145, 'DEF': 135, 'SPATK': 100, 'SPDEF': 135, 'SPEED': 95},
    'level': 50,
    'moves': [
        {'name': 'バークアウト', 'type': 'あく', 'power': 55, 'accuracy': 100, 'pp': 15, 'maxPP': 15, 'category': 'special'},
        {'name': 'じだんだ', 'type': 'じめん', 'power': 75, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'physical'},
        {'name': 'おにび', 'type': 'ほのお', 'power': 0, 'accuracy': 85, 'pp': 15, 'maxPP': 15, 'category': 'status', 'status': 'burn'},
        {'name': 'あさのひざし', 'type': 'ノーマル', 'power': 0, 'accuracy': 100, 'pp': 5, 'maxPP': 5, 'category': 'status', 'heal': 0.5}
    ]
}

dragon_data = {
    'name': 'ドラパルト',
    'types': ['ドラゴン', 'ゴースト'],
    'ability': 'すりぬけ',
    'item': 'いのちのたま',
    'stats': {'HP': 168, 'ATK': 175, 'DEF': 95, 'SPATK': 175, 'SPDEF': 95, 'SPEED': 213},
    'level': 50,
    'moves': [
        {'name': 'りゅうのはどう', 'type': 'ドラゴン', 'power': 85, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'special'},
        {'name': 'たたりめ', 'type': 'ゴースト', 'power': 65, 'accuracy': 100, 'pp': 10, 'maxPP': 10, 'category': 'special'},
        {'name': '10まんボルト', 'type': 'でんき', 'power': 90, 'accuracy': 100, 'pp': 15, 'maxPP': 15, 'category': 'special'},
        {'name': 'かえんほうしゃ', 'type': 'ほのお', 'power': 90, 'accuracy': 100, 'pp': 15, 'maxPP': 15, 'category': 'special'}
    ]
}

# バトルエンジンの初期化
engine = BattleEngine()

# ポケモンの生成
kabaldon = Pokemon(kabaldon_data)
windy = Pokemon(windy_data)
dragon = Pokemon(dragon_data)

# チームの定義
team_a = [kabaldon]  # 妖竜の先発
team_b = [windy, dragon]  # 状態異常撒きPT

# アクティブポケモン
active_a = kabaldon
active_b = windy

print('=== サンプルバトル開始 ===')
print(f"Team A: {', '.join([p.name for p in team_a])}")
print(f"Team B: {', '.join([p.name for p in team_b])}")
print()

# ターン1
engine.start_turn()

# 場に出す（特性発動）
active_a = engine.switch_in(active_a, team_a)
active_b = engine.switch_in(active_b, team_b)

# 行動速度を計算
speed_a = engine.calculate_speed(active_a)
speed_b = engine.calculate_speed(active_b)

# 速度判定
if speed_a > speed_b:
    print(f"{active_a.name}が先に行動")
    # カバルドンがまもるを選択（すなあらしは不要）
    engine.use_move(active_a, active_b, active_a.moves[3])  # まもる
    engine.use_move(active_b, active_a, active_b.moves[2])  # おにび
else:
    print(f"{active_b.name}が先に行動")
    # ウインディがおにびを選択
    engine.use_move(active_b, active_a, active_b.moves[2])  # おにび
    engine.use_move(active_a, active_b, active_a.moves[3])  # まもる

engine.end_turn(team_a, team_b)

# ターン2
engine.start_turn()

# ウインディがドラパルトに交代
active_b = engine.switch_in(dragon, team_b)

# 速度判定
speed_a2 = engine.calculate_speed(active_a)
speed_b2 = engine.calculate_speed(active_b)

if speed_a2 > speed_b2:
    print(f"{active_a.name}が先に行動")
    engine.use_move(active_a, active_b, active_a.moves[0])  # じしん
    engine.use_move(active_b, active_a, active_b.moves[0])  # りゅうのはどう
else:
    print(f"{active_b.name}が先に行動")
    engine.use_move(active_b, active_a, active_b.moves[0])  # りゅうのはどう
    engine.use_move(active_a, active_b, active_a.moves[0])  # じしん

engine.end_turn(team_a, team_b)

# バトルログを出力
print('\n' + '=' * 50)
print(engine.get_log())

