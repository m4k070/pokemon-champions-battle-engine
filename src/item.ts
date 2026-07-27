export interface ItemConstructorData {
  name: string;
  category: string;
  effect: string;
}

export class Item {
  name: string;
  category: string;
  effect: string;

  constructor(data: ItemConstructorData) {
    this.name = data.name;
    this.category = data.category;
    this.effect = data.effect;
  }
}
