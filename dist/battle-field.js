// 天候・トリックルームはBattleEngine側が単一の情報源として保持する
// （このクラスは設置技など「陣営ごとの」フィールド状態のみを扱う）。
export class BattleField {
    stealthRock;
    spikes;
    toxicSpikes;
    stickyWeb;
    auroraVeil;
    reflect;
    lightScreen;
    tailwind;
    constructor() {
        this.stealthRock = { playerA: false, playerB: false };
        this.spikes = { playerA: 0, playerB: 0 };
        this.toxicSpikes = { playerA: 0, playerB: 0 };
        this.stickyWeb = { playerA: false, playerB: false };
        this.auroraVeil = { playerA: 0, playerB: 0 };
        this.reflect = { playerA: 0, playerB: 0 };
        this.lightScreen = { playerA: 0, playerB: 0 };
        this.tailwind = { playerA: 0, playerB: 0 };
    }
}
//# sourceMappingURL=battle-field.js.map