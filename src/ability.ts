export interface AbilityConstructorData {
  name: string;
  description: string;
  isHidden?: boolean;
}

export class Ability {
  name: string;
  description: string;
  isHidden: boolean;

  constructor(data: AbilityConstructorData) {
    this.name = data.name;
    this.description = data.description;
    this.isHidden = data.isHidden ?? false;
  }
}
