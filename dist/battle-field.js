export class BattleField {
    weather;
    weatherTurnsLeft;
    trickRoom;
    trickRoomTurnsLeft;
    stealthRock;
    spikes;
    toxicSpikes;
    stickyWeb;
    auroraVeil;
    reflect;
    lightScreen;
    tailwind;
    constructor() {
        this.weather = null;
        this.weatherTurnsLeft = 0;
        this.trickRoom = false;
        this.trickRoomTurnsLeft = 0;
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