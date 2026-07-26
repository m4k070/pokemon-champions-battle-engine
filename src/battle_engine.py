"""
ポケモンチャンピオンズ バトルエンジン v2.0

エージェントは「技を選ぶ」「交代する」といった操作のみを実行。
実際の処理（ダメージ計算、状態異常、天候変化等）はこのプログラムが担当。
"""

class Pokemon:
    def __init__(self, data):
        self.name = data['name']
        self.types = data['types']  # ['タイプ1', 'タイプ2']
        self.ability = data['ability']
        self.item = data.get('item')
        self.base_stats = data['stats']  # { 'HP': 263, 'ATK': 135, ... }
        self.stats = self.calculate_stats(data['stats'], data.get('level', 50))
        self.moves = data['moves']  # [{ name, type, power, accuracy, pp, maxPP, category, ... }]
        self.current_hp = self.stats['HP']
        self.max_hp = self.stats['HP']
        self.status = None  # None, 'burn', 'poison', 'paralysis', 'sleep', 'freeze'
        self.status_turns_left = 0
        self.is_fainted = False
        self.level = data.get('level', 50)
    
    def calculate_stats(self, base_stats, level):
        """簡易的な実数値計算（チャンピオンズ仕様）"""
        stats = {}
        stats['HP'] = int(base_stats['HP'] * 2 + 31 + int(base_stats['HP'] / 4) + level + 10)
        for stat in ['ATK', 'DEF', 'SPATK', 'SPDEF', 'SPEED']:
            stats[stat] = int(base_stats[stat] * 2 + 31)
        return stats
    
    def take_damage(self, damage):
        self.current_hp = max(0, self.current_hp - damage)
        if self.current_hp == 0:
            self.is_fainted = True
    
    def heal(self, amount):
        self.current_hp = min(self.max_hp, self.current_hp + amount)
    
    def apply_status(self, status):
        if self.status:
            return False  # すでに状態異常
        self.status = status
        if status == 'sleep':
            self.status_turns_left = int(random() * 3) + 1  # 1-3ターン
        return True
    
    def remove_status(self):
        self.status = None
        self.status_turns_left = 0
    
    def get_effective_speed(self, trick_room=False):
        speed = self.stats['SPEED']
        if self.status == 'paralysis':
            speed = speed // 2
        return -speed if trick_room else speed


class BattleEngine:
    def __init__(self):
        self.weather = None  # None, 'sand', 'rain', 'sun', 'hail'
        self.weather_turns_left = 0
        self.trick_room = False
        self.trick_room_turns_left = 0
        self.turn = 0
        self.log = []
        
        # タイプ相性表
        self.type_chart = {
            'ノーマル': { 'いわ': 0.5, 'ゴースト': 0.0, 'はがね': 0.5 },
            'ほのお': { 'みず': 0.5, 'くさ': 2.0, 'こおり': 2.0, 'はがね': 2.0, 'ほのお': 0.5, 'いわ': 0.5, 'ドラゴン': 0.5 },
            'みず': { 'ほのお': 2.0, 'みず': 0.5, 'くさ': 0.5, 'じめん': 2.0, 'いわ': 2.0, 'ドラゴン': 0.5 },
            'でんき': { 'みず': 2.0, 'でんき': 0.5, 'くさ': 0.5, 'じめん': 0.0, 'ひこう': 2.0, 'ドラゴン': 0.5 },
            'くさ': { 'みず': 2.0, 'ほのお': 0.5, 'くさ': 0.5, 'どく': 0.5, 'じめん': 2.0, 'ひこう': 0.5, 'むし': 0.5, 'いわ': 2.0, 'ドラゴン': 0.5, 'はがね': 0.5 },
            'こおり': { 'ほのお': 0.5, 'みず': 0.5, 'くさ': 2.0, 'こおり': 0.5, 'じめん': 2.0, 'ひこう': 2.0, 'ドラゴン': 2.0, 'はがね': 0.5 },
            'かくとう': { 'ノーマル': 2.0, 'ほのお': 2.0, 'みず': 2.0, 'でんき': 2.0, 'くさ': 2.0, 'こおり': 2.0, 'どく': 0.5, 'じめん': 2.0, 'ひこう': 0.5, 'エスパー': 0.5, 'むし': 0.5, 'いわ': 2.0, 'ゴースト': 0.0, 'ドラゴン': 2.0, 'あく': 2.0, 'はがね': 2.0, 'フェアリー': 0.5 },
            'どく': { 'くさ': 2.0, 'どく': 0.5, 'じめん': 0.5, 'いわ': 0.5, 'ゴースト': 0.5, 'はがね': 0.0, 'フェアリー': 2.0 },
            'じめん': { 'ほのお': 2.0, 'でんき': 2.0, 'くさ': 0.5, 'どく': 2.0, 'ひこう': 0.0, 'むし': 0.5, 'いわ': 2.0, 'はがね': 2.0 },
            'ひこう': { 'くさ': 2.0, 'でんき': 0.5, 'かくとう': 2.0, 'むし': 2.0, 'いわ': 0.5, 'はがね': 0.5 },
            'エスパー': { 'かくとう': 2.0, 'どく': 2.0, 'エスパー': 0.5, 'あく': 0.0, 'はがね': 0.5 },
            'むし': { 'ほのお': 0.5, 'くさ': 2.0, 'かくとう': 0.5, 'どく': 0.5, 'ひこう': 0.5, 'エスパー': 2.0, 'ゴースト': 0.5, 'あく': 2.0, 'はがね': 0.5, 'フェアリー': 0.5 },
            'いわ': { 'ほのお': 2.0, 'みず': 2.0, 'くさ': 2.0, 'かくとう': 0.5, 'じめん': 0.5, 'ひこう': 2.0, 'むし': 2.0, 'はがね': 0.5 },
            'ゴースト': { 'ノーマル': 0.0, 'エスパー': 2.0, 'ゴースト': 2.0, 'あく': 0.5 },
            'ドラゴン': { 'ドラゴン': 2.0, 'はがね': 0.5, 'フェアリー': 0.0 },
            'あく': { 'かくとう': 0.5, 'エスパー': 2.0, 'ゴースト': 2.0, 'あく': 0.5, 'はがね': 0.5, 'フェアリー': 0.5 },
            'はがね': { 'ほのお': 0.5, 'みず': 0.5, 'でんき': 0.5, 'こおり': 2.0, 'いわ': 2.0, 'はがね': 0.5, 'フェアリー': 2.0 },
            'フェアリー': { 'ほのお': 0.5, 'かくとう': 2.0, 'どく': 0.5, 'ドラゴン': 2.0, 'あく': 2.0, 'はがね': 0.5 }
        }
    
    def get_type_effectiveness(self, attack_type, defender_types):
        """タイプ相性を取得"""
        effectiveness = 1.0
        for dtype in defender_types:
            chart = self.type_chart.get(attack_type, {})
            effectiveness *= chart.get(dtype, 1.0)
        return effectiveness
    
    def start_turn(self):
        """ターン開始時の処理"""
        self.turn += 1
        self.log.append(f"\n===== ターン{self.turn}開始 =====")
        
        # 天候のターン経過
        if self.weather_turns_left > 0:
            self.weather_turns_left -= 1
            if self.weather_turns_left == 0:
                self.log.append(f"天候「{self.weather}」が終了しました")
                self.weather = None
        
        # トリックルームのターン経過
        if self.trick_room_turns_left > 0:
            self.trick_room_turns_left -= 1
            if self.trick_room_turns_left == 0:
                self.log.append("トリックルームが終了しました")
                self.trick_room = False
    
    def switch_in(self, pokemon, team):
        """ポケモンを場に出す（特性発動）"""
        self.log.append(f"{pokemon.name}が場に出た")
        
        # 特性の発動
        if pokemon.ability == 'すなおこし' and self.weather != 'sand':
            self.weather = 'sand'
            self.weather_turns_left = 5
            self.log.append(f"{pokemon.name}の特性「すなおこし」により砂嵐が発生した")
        elif pokemon.ability == 'あめふらし' and self.weather != 'rain':
            self.weather = 'rain'
            self.weather_turns_left = 5
            self.log.append(f"{pokemon.name}の特性「あめふらし」により雨が発生した")
        elif pokemon.ability == 'ひでり' and self.weather != 'sun':
            self.weather = 'sun'
            self.weather_turns_left = 5
            self.log.append(f"{pokemon.name}の特性「ひでり」により晴れが発生した")
        elif pokemon.ability == 'ゆきげしき' and self.weather != 'hail':
            self.weather = 'hail'
            self.weather_turns_left = 5
            self.log.append(f"{pokemon.name}の特性「ゆきげしき」により霰が発生した")
        
        return pokemon
    
    def apply_status_effects(self, team):
        """状態異常の効果適用（ターン終了時）"""
        for pokemon in team:
            if pokemon.is_fainted:
                continue
            
            if pokemon.status == 'burn':
                damage = pokemon.max_hp // 16
                pokemon.take_damage(damage)
                self.log.append(f"{pokemon.name}は火傷ダメージで{damage}のダメージを受けた")
            elif pokemon.status == 'poison':
                damage = pokemon.max_hp // 8
                pokemon.take_damage(damage)
                self.log.append(f"{pokemon.name}は毒ダメージで{damage}のダメージを受けた")
            elif pokemon.status == 'sleep':
                pokemon.status_turns_left -= 1
                if pokemon.status_turns_left <= 0:
                    pokemon.remove_status()
                    self.log.append(f"{pokemon.name}は眠りから覚めた")
                else:
                    self.log.append(f"{pokemon.name}は眠り続けている（残り{pokemon.status_turns_left}ターン）")
    
    def calculate_damage(self, attacker, defender, move):
        """ダメージ計算"""
        if move['power'] == 0:
            return 0, 1.0  # 変化技
        
        power = move['power']
        attack = attacker.stats['ATK' if move['category'] == 'physical' else 'SPATK']
        defense = defender.stats['DEF' if move['category'] == 'physical' else 'SPDEF']
        
        # タイプ一致ボーナス
        if move['type'] in attacker.types:
            power *= 1.5
        
        # タイプ相性
        effectiveness = self.get_type_effectiveness(move['type'], defender.types)
        
        # 天候ボーナス
        if self.weather == 'rain' and move['type'] == 'みず':
            power *= 1.5
        elif self.weather == 'sun' and move['type'] == 'ほのお':
            power *= 1.5
        elif self.weather == 'rain' and move['type'] == 'ほのお':
            power *= 0.5
        elif self.weather == 'sun' and move['type'] == 'みず':
            power *= 0.5
        
        # 火傷で物理攻撃半減
        if attacker.status == 'burn' and move['category'] == 'physical':
            attack = attack // 2
        
        # ダメージ計算式（簡易版）
        damage = int(((2 * 50 / 5 + 2) * power * (attack / defense)) / 50) + 2
        damage = int(damage * effectiveness)
        
        return damage, effectiveness
    
    def use_move(self, attacker, defender, move):
        """技の使用"""
        self.log.append(f"{attacker.name}の{move['name']}")
        
        # 命中率チェック
        if 'accuracy' in move and move['accuracy'] < 100:
            import random
            if random.random() * 100 > move['accuracy']:
                self.log.append("技は外れた")
                return {'success': False}
        
        # 状態異常技
        if 'status' in move:
            applied = defender.apply_status(move['status'])
            if applied:
                self.log.append(f"{defender.name}は{move['status']}状態になった")
            else:
                self.log.append("効果がない")
            return {'success': True, 'status': move['status']}
        
        # トリックルーム
        if move['name'] == 'トリックルーム':
            self.trick_room = True
            self.trick_room_turns_left = 5
            self.log.append("トリックルームが発生した")
            return {'success': True, 'trickRoom': True}
        
        # ダメージ技
        damage, effectiveness = self.calculate_damage(attacker, defender, move)
        defender.take_damage(damage)
        
        if effectiveness > 1:
            self.log.append("効果は抜群だ！")
        elif effectiveness < 1 and effectiveness > 0:
            self.log.append("効果はいまひとつのようだ")
        elif effectiveness == 0:
            self.log.append("効果がなかった")
        
        self.log.append(f"{defender.name}に{damage}のダメージ")
        
        if defender.is_fainted:
            self.log.append(f"{defender.name}は戦闘不能になった")
        
        return {'success': True, 'damage': damage, 'effectiveness': effectiveness}
    
    def end_turn(self, team_a, team_b):
        """ターン終了時の処理"""
        self.apply_status_effects(team_a)
        self.apply_status_effects(team_b)
    
    def get_log(self):
        """バトルログを取得"""
        return '\n'.join(self.log)
    
    def calculate_speed(self, pokemon):
        """行動速度を計算（トリックルーム考慮）"""
        return pokemon.get_effective_speed(self.trick_room)

