export class BattleState {
    turn;
    weather;
    weatherTurnsLeft;
    trickRoom;
    trickRoomTurnsLeft;
    log;
    forceEnd;
    constructor() {
        this.turn = 0;
        this.weather = null;
        this.weatherTurnsLeft = 0;
        this.trickRoom = false;
        this.trickRoomTurnsLeft = 0;
        this.log = [];
        this.forceEnd = false;
    }
}
//# sourceMappingURL=battle-state.js.map