export class Ability {
    name;
    description;
    isHidden;
    constructor(data) {
        this.name = data.name;
        this.description = data.description;
        this.isHidden = data.isHidden ?? false;
    }
}
//# sourceMappingURL=ability.js.map