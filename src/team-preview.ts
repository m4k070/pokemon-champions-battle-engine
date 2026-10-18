import { BattleSession } from './battle-runner.js';
import type { StartSessionOptions } from './battle-runner.js';
import { restorePokemon, snapshotPokemon } from './battle-snapshot.js';
import type { Pokemon } from './pokemon.js';
import type { TypeName } from './types.js';

// 見せ合い（選出）で対戦に出す匹数。シングル63は3体。
export const DEFAULT_PARTY_SIZE = 3;

// 選出の一手。pokemonIndices の先頭が先発で、残りは控え。
// 控えの並び順は対戦（瀕死後に誰を出すか）を縛らないが、
// 「どの3体を選び、どれを先発にするか」を1つの操作として持つために配列で表す。
export interface SelectionAction {
  type: 'select';
  pokemonIndices: number[];
}

// 対戦中の行動（AgentDecision）と同じ形にしてある。探索側が同じ扱いで分岐を並べられるように。
export interface SelectionDecision {
  action: SelectionAction;
  reasoning?: string;
}

export interface TeamPreviewOptions {
  // 選出する匹数。省略時は3（シングル63）。
  partySize?: number;
  // 選出が終わったあと BattleSession へ引き継ぐオプション（rng など）。
  // 先発と選出メンバーは選出結果から決まるため、ここからは指定しない。
  battle?: Omit<StartSessionOptions, 'leadA' | 'leadB'>;
}

// 見せ合いで見える情報は種族とタイプのみ（本編では相手の持ち物・技は見えない）。
export interface PreviewPokemonView {
  name: string;
  types: TypeName[];
}

export interface PreviewView {
  partySize: number;
  ownRoster: PreviewPokemonView[];
  opponentRoster: PreviewPokemonView[];
  // 確定した選出（先発が先頭）。未確定なら null。
  ownSelection: number[] | null;
  opponentSelection: number[] | null;
  needsSelection: boolean;
}

function combinations(size: number, pick: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const walk = (start: number): void => {
    if (current.length === pick) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < size; index++) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

function rosterView(roster: Pokemon[]): PreviewPokemonView[] {
  return roster.map((pokemon) => ({ name: pokemon.name, types: [...pokemon.types] }));
}

// 選出（見せ合い）の一手を扱う。対戦本体（BattleSession）は「選ばれた3体」だけを
// 知っていればよいので、選出は戦闘の外側の段階として分けてある。
// 両者が選出を確定してから startBattle() で対戦に入る（本編と同じ同時決定）。
// 探索では legalSelections() を候補手として並べ、fork() で枝分かれさせる。
export class TeamPreview {
  readonly partySize: number;
  private rosters: [Pokemon[], Pokemon[]];
  private selections: [number[] | null, number[] | null] = [null, null];
  private readonly battleOptions: Omit<StartSessionOptions, 'leadA' | 'leadB'>;

  private constructor(
    rosters: [Pokemon[], Pokemon[]],
    partySize: number,
    battleOptions: Omit<StartSessionOptions, 'leadA' | 'leadB'>
  ) {
    this.rosters = rosters;
    this.partySize = partySize;
    this.battleOptions = battleOptions;
  }

  static begin(rosterA: Pokemon[], rosterB: Pokemon[], options: TeamPreviewOptions = {}): TeamPreview {
    if (rosterA.length === 0 || rosterB.length === 0) {
      throw new Error('見せ合いには両陣営とも1体以上のポケモンが必要です');
    }
    const partySize = options.partySize ?? DEFAULT_PARTY_SIZE;
    if (!Number.isInteger(partySize) || partySize < 1) {
      throw new Error(`選出する匹数が不正です: ${partySize}`);
    }
    if (partySize > rosterA.length || partySize > rosterB.length) {
      throw new Error(
        `選出する匹数が手持ちを超えています: partySize=${partySize}, A=${rosterA.length}, B=${rosterB.length}`
      );
    }
    return new TeamPreview([[...rosterA], [...rosterB]], partySize, options.battle ?? {});
  }

  roster(side: 0 | 1): Pokemon[] {
    return this.rosters[side];
  }

  needsSelection(side: 0 | 1): boolean {
    return this.selections[side] === null;
  }

  isComplete(): boolean {
    return this.selections[0] !== null && this.selections[1] !== null;
  }

  // 確定した選出（先発が先頭）。未確定なら null。
  selection(side: 0 | 1): number[] | null {
    const selection = this.selections[side];
    return selection === null ? null : [...selection];
  }

  // 選出されたポケモン（先発が先頭）。未確定なら null。
  selectedParty(side: 0 | 1): Pokemon[] | null {
    const selection = this.selections[side];
    if (selection === null) return null;
    return selection.map((index) => this.rosters[side][index]);
  }

  // 合法な選出の一覧（先発が先頭）。集合が同じでも先発が違えば別の一手として列挙する
  // （6体から3体なら 20通り × 先発3通り = 60手）。
  legalSelections(side: 0 | 1): number[][] {
    const roster = this.rosters[side];
    const selections: number[][] = [];
    for (const combo of combinations(roster.length, this.partySize)) {
      for (let lead = 0; lead < combo.length; lead++) {
        selections.push([combo[lead], ...combo.filter((_, position) => position !== lead)]);
      }
    }
    return selections;
  }

  applySelection(side: 0 | 1, decision: SelectionDecision): void {
    if (!this.needsSelection(side)) {
      throw new Error(`side=${side}は既に選出済みです`);
    }
    if (decision.action.type !== 'select') {
      throw new Error(`side=${side}の選出にはselect以外の行動が渡されました: ${JSON.stringify(decision.action)}`);
    }
    const indices = decision.action.pokemonIndices;
    this.requireValidSelection(side, indices);
    this.selections[side] = [...indices];
  }

  view(side: 0 | 1): PreviewView {
    const opponent = side === 0 ? 1 : 0;
    return {
      partySize: this.partySize,
      ownRoster: rosterView(this.rosters[side]),
      opponentRoster: rosterView(this.rosters[opponent]),
      ownSelection: this.selection(side),
      opponentSelection: this.selection(opponent),
      needsSelection: this.needsSelection(side),
    };
  }

  // 同じ見せ合いから独立した枝を作る。手持ちは複製するため、片方の対戦でHPが減っても
  // もう片方や元の見せ合いに影響しない。
  fork(): TeamPreview {
    const forked = new TeamPreview(
      [this.rosters[0].map(clonePokemon), this.rosters[1].map(clonePokemon)],
      this.partySize,
      this.battleOptions
    );
    forked.selections = [
      this.selections[0] === null ? null : [...this.selections[0]],
      this.selections[1] === null ? null : [...this.selections[1]],
    ];
    return forked;
  }

  // 両者の選出が確定したら対戦を開始する。
  // 渡すポケモンは複製するので、この見せ合いから何度でも（別の選出の枝も含めて）開始できる。
  async startBattle(): Promise<BattleSession> {
    if (!this.isComplete()) {
      const pending = [this.needsSelection(0) ? 'side=0' : null, this.needsSelection(1) ? 'side=1' : null]
        .filter((value): value is string => value !== null)
        .join(', ');
      throw new Error(`選出が確定していません（未確定: ${pending}）`);
    }

    const partyA = this.requireSelection(0).map((index) => clonePokemon(this.rosters[0][index]));
    const partyB = this.requireSelection(1).map((index) => clonePokemon(this.rosters[1][index]));

    return BattleSession.start(partyA, partyB, {
      ...this.battleOptions,
      leadA: partyA[0],
      leadB: partyB[0],
    });
  }

  private requireSelection(side: 0 | 1): number[] {
    const selection = this.selections[side];
    if (selection === null) {
      throw new Error(`side=${side}の選出が確定していません`);
    }
    return selection;
  }

  private requireValidSelection(side: 0 | 1, indices: number[]): void {
    if (indices.length !== this.partySize) {
      throw new Error(`side=${side}の選出は${this.partySize}体である必要があります: ${indices.length}体`);
    }
    const roster = this.rosters[side];
    const seen = new Set<number>();
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= roster.length) {
        throw new Error(`side=${side}の選出先が不正です: index=${index}`);
      }
      if (seen.has(index)) {
        throw new Error(`side=${side}の選出に同じポケモンが含まれています: index=${index}`);
      }
      if (roster[index].isFainted) {
        throw new Error(`side=${side}の選出に瀕死のポケモンは選べません: index=${index}`);
      }
      seen.add(index);
    }
  }
}

// 見せ合いの分岐・対戦の開始点では、同じポケモン実体を渡すとHPやPPが共有されてしまう。
// スナップショット経由で作り直し、必ず独立した実体を渡す。
function clonePokemon(pokemon: Pokemon): Pokemon {
  return restorePokemon(snapshotPokemon(pokemon));
}
