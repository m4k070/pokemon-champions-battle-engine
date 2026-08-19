import { BattleEngine } from './battle-engine.js';
import { MegaEvolutionSystem } from './rules/mega-evolution.js';
import { getAbilityDefinition } from './rules/abilities/registry.js';
import type { Pokemon } from './pokemon.js';
import type { AgentAction } from './types.js';
import type { BattleAgent, BattleContext, AgentDecision } from './ai/battle-agent.js';
import { snapshotBattle, restoreBattle } from './battle-snapshot.js';
import type { BattleSnapshot, PendingTurn } from './battle-snapshot.js';

export interface TurnReasoning {
  turn: number;
  side: 0 | 1;
  pokemonName: string;
  reasoning?: string;
}

export interface BattleResult {
  winner: 0 | 1 | null; // nullは引き分け（maxTurns到達）
  turns: number;
  log: string;
  reasoningLog: TurnReasoning[];
}

function sideKey(side: 0 | 1): 'playerA' | 'playerB' {
  return side === 0 ? 'playerA' : 'playerB';
}

function buildContext(
  engine: BattleEngine,
  side: 0 | 1,
  self: Pokemon,
  selfTeam: Pokemon[],
  opponent: Pokemon,
  opponentTeam: Pokemon[],
  canMegaEvolve: boolean,
  mustSwitch: boolean
): BattleContext {
  return {
    turn: engine.turn,
    self,
    selfTeam,
    opponent,
    opponentTeam,
    canMegaEvolve,
    mustSwitch,
    field: {
      weather: engine.weather,
      weatherTurnsLeft: engine.weatherTurnsLeft,
      trickRoom: engine.trickRoom,
      trickRoomTurnsLeft: engine.trickRoomTurnsLeft,
      stealthRock: {
        self: engine.field.stealthRock[sideKey(side)],
        opponent: engine.field.stealthRock[sideKey(side === 0 ? 1 : 0)],
      },
    },
    recentLog: engine.log,
  };
}

function isTeamWiped(team: Pokemon[]): boolean {
  return team.every((p) => p.isFainted);
}

export interface StartSessionOptions {
  leadA?: Pokemon;
  leadB?: Pokemon;
  engine?: BattleEngine;
  megaEvolutionSystem?: MegaEvolutionSystem;
}

// 1ターンずつ進められるバトルの実行単位。snapshot()/restore()/fork()により
// undo・redo・分岐探索（同じ局面から異なる行動を試す）に対応する。
// 「行動を決める」（BattleAgent）と「行動を適用する」（このクラス）を分離しているため、
// LLMや人間が選んだ行動をそのままapplyTurn/applyForcedSwitchに渡すこともできる。
export class BattleSession {
  engine: BattleEngine;
  teamA: Pokemon[];
  teamB: Pokemon[];
  activeA: Pokemon;
  activeB: Pokemon;
  megaEvolutionSystem: MegaEvolutionSystem;
  reasoningLog: TurnReasoning[] = [];
  private turnBegun = false;
  // 技の実行途中でpivot技の交代先入力を待つために、ターンの進行状態をここに保持する。
  // nullならターンの技フェーズは実行中でない（=未開始または完了済み）。
  private pendingTurn: PendingTurn | null = null;

  private constructor(
    engine: BattleEngine,
    teamA: Pokemon[],
    teamB: Pokemon[],
    activeA: Pokemon,
    activeB: Pokemon,
    megaEvolutionSystem: MegaEvolutionSystem
  ) {
    this.engine = engine;
    this.teamA = teamA;
    this.teamB = teamB;
    this.activeA = activeA;
    this.activeB = activeB;
    this.megaEvolutionSystem = megaEvolutionSystem;
  }

  static async start(teamA: Pokemon[], teamB: Pokemon[], options: StartSessionOptions = {}): Promise<BattleSession> {
    const engine = options.engine ?? new BattleEngine();
    const megaEvolutionSystem = options.megaEvolutionSystem ?? new MegaEvolutionSystem();
    const leadA = options.leadA ?? teamA[0];
    const leadB = options.leadB ?? teamB[0];

    engine.setActivePokemon(0, leadA);
    engine.setActivePokemon(1, leadB);

    // 天候変化特性などのswitch-in効果は、すばやさが遅い側が後に発動して上書きする仕様のため、
    // 速い順に(=遅い方を最後に)switchInする。
    const order = engine.orderBySpeed([
      { side: 0 as const, pokemon: leadA, team: teamA },
      { side: 1 as const, pokemon: leadB, team: teamB },
    ]);
    for (const entry of order) {
      engine.switchIn(entry.pokemon, entry.team, entry.side);
    }

    return new BattleSession(engine, teamA, teamB, leadA, leadB, megaEvolutionSystem);
  }

  static fromSnapshot(snapshot: BattleSnapshot, megaEvolutionSystem: MegaEvolutionSystem = new MegaEvolutionSystem()): BattleSession {
    const { engine, teamA, teamB, activeA, activeB } = restoreBattle(snapshot);
    const session = new BattleSession(engine, teamA, teamB, activeA, activeB, megaEvolutionSystem);
    session.restoreSessionState(snapshot);
    return session;
  }

  snapshot(): BattleSnapshot {
    return {
      ...snapshotBattle(this.engine, this.teamA, this.teamB, this.activeA, this.activeB),
      session: {
        turnBegun: this.turnBegun,
        pendingTurn: this.pendingTurn === null ? null : structuredClone(this.pendingTurn),
      },
    };
  }

  // 現在の状態にsnapshotを反映する（undo/redoの実体）。
  restore(snapshot: BattleSnapshot): void {
    const { engine, teamA, teamB, activeA, activeB } = restoreBattle(snapshot);
    this.engine = engine;
    this.teamA = teamA;
    this.teamB = teamB;
    this.activeA = activeA;
    this.activeB = activeB;
    this.restoreSessionState(snapshot);
  }

  // ターン進行状態(beginTurn済みか・技フェーズの途中か)はBattleSnapshot.sessionに載る。
  // sessionを持たない古いスナップショットは「ターン境界」として復元する。
  private restoreSessionState(snapshot: BattleSnapshot): void {
    this.turnBegun = snapshot.session?.turnBegun ?? false;
    const pendingTurn = snapshot.session?.pendingTurn ?? null;
    this.pendingTurn = pendingTurn === null ? null : structuredClone(pendingTurn);
  }

  // 現在の状態から独立した別セッションを作る（分岐探索用）。
  // structuredCloneでスナップショットを複製してから復元するため、参照を共有しない。
  fork(): BattleSession {
    const session = BattleSession.fromSnapshot(structuredClone(this.snapshot()), this.megaEvolutionSystem);
    session.reasoningLog = [...this.reasoningLog];
    return session;
  }

  isFinished(): boolean {
    return isTeamWiped(this.teamA) || isTeamWiped(this.teamB);
  }

  winner(): 0 | 1 | null {
    if (isTeamWiped(this.teamA)) return 1;
    if (isTeamWiped(this.teamB)) return 0;
    return null;
  }

  needsForcedSwitch(side: 0 | 1): boolean {
    const active = side === 0 ? this.activeA : this.activeB;
    return active.isFainted && !this.isFinished();
  }

  // pivot技を使った側が、攻撃後の交代先の入力を待っている状態か。
  needsPivotSwitch(side: 0 | 1): boolean {
    return this.pendingTurn?.awaitingPivotSide === side;
  }

  // 入力待ちの側（いなければnull）。呼び出し側がループを回すために使う。
  pendingPivotSide(): 0 | 1 | null {
    return this.pendingTurn?.awaitingPivotSide ?? null;
  }

  // 技フェーズが完了しているか。falseの間はendTurn()を呼べない。
  isTurnComplete(): boolean {
    return this.pendingTurn === null;
  }

  getContext(side: 0 | 1): BattleContext {
    const canMegaEvolve = this.megaEvolutionSystem.canMegaEvolve(side === 0 ? this.activeA : this.activeB);
    // 瀕死交代とpivot交代はどちらも「技を選べず交代先だけを選ぶ場面」なので同じフラグに集約する。
    const mustSwitch = this.needsForcedSwitch(side) || this.needsPivotSwitch(side);

    return side === 0
      ? buildContext(this.engine, 0, this.activeA, this.teamA, this.activeB, this.teamB, canMegaEvolve, mustSwitch)
      : buildContext(this.engine, 1, this.activeB, this.teamB, this.activeA, this.teamA, canMegaEvolve, mustSwitch);
  }

  // ターン開始処理（天候・トリックルームの残りターン消費）。1ターンにつき1回だけ効く。
  beginTurn(): void {
    if (this.turnBegun) return;
    this.engine.startTurn();
    this.turnBegun = true;
  }

  applyForcedSwitch(side: 0 | 1, decision: AgentDecision): void {
    if (decision.action.type !== 'switch') {
      throw new Error(`side=${side}は強制交代が必要ですが、switch以外の行動が渡されました: ${JSON.stringify(decision.action)}`);
    }

    const team = side === 0 ? this.teamA : this.teamB;
    const fainted = side === 0 ? this.activeA : this.activeB;
    const replacement = team[decision.action.pokemonIndex];

    if (!replacement || replacement.isFainted) {
      throw new Error(`side=${side}の強制交代先が不正です: index=${decision.action.pokemonIndex}`);
    }

    this.reasoningLog.push({ turn: this.engine.turn, side, pokemonName: fainted.name, reasoning: decision.reasoning });
    this.switchTo(side, replacement, team);
  }

  // かげふみによる交代阻止の判定。通常交代（applyTurn内のswitch）でのみ呼ばれる。
  // - 相手（場に残る側）が shadow-tag 持ち
  // - 相手も同時に交代する場合は場を離れるため発動しない（両者交代は成立）
  // - 交代先がゴーストタイプなら無効（かげふみはゴーストに効かない）
  // - 瀕死交代（applyForcedSwitch）・pivot交代はこの経路を通らないため防げない
  private isBlockedByShadowTag(side: 0 | 1, replacement: Pokemon, opponentAction: AgentDecision['action']): boolean {
    const opponent = side === 0 ? this.activeB : this.activeA;
    if (!opponent || opponent.isFainted) return false;
    if (opponent.ability !== 'shadow-tag') return false;
    if (opponentAction.type === 'switch') return false; // 両者交代なら阻止しない
    if (replacement.types.includes('ghost')) return false;
    // きれいなぬけがら: かげふみ・ありじごく等の交代阻止を無視できる。
    if (replacement.item === 'shed-shell') return false;
    return true;
  }

  // 場を離れるポケモンの状態をリセットしてから交代先を場に出す。
  // 通常交代・強制交代・pivot技による交代のすべてがこの一箇所を通る。
  private switchTo(side: 0 | 1, replacement: Pokemon, team: Pokemon[]): void {
    const outgoing = side === 0 ? this.activeA : this.activeB;
    outgoing.resetStatStages(); // 能力ランクは場を離れるとリセットされる
    outgoing.resetToxicCounter(); // 猛毒の経過ターン数も場を離れるとリセットされる
    outgoing.resetSeeded(); // やどりぎのタネも場を離れると解除される
    outgoing.resetLockedMove(); // こだわり系の技固定も場を離れると解除される
    outgoing.resetTaunt(); // ちょうはつも場を離れると解除される

    // 場を離れるときの特性フック（さいせいりょく等）。
    const ability = getAbilityDefinition(outgoing.ability);
    ability?.onSwitchOut?.({ pokemon: outgoing, engine: this.engine });

    this.engine.setActivePokemon(side, replacement);
    const switched = this.engine.switchIn(replacement, team, side);

    if (side === 0) this.activeA = switched;
    else this.activeB = switched;
  }

  // 両陣営が同時に選んだ行動を適用する。交代は(switch-in効果の上書き順を除き)
  // 移動より先に解決し、技はその場に出ている側のcalculateSpeed順（トリックルーム込み、
  // 同速はランダム）に実行する。
  applyTurn(decisionA: AgentDecision, decisionB: AgentDecision): void {
    if (!this.turnBegun) {
      throw new Error('beginTurn()を先に呼んでください');
    }
    if (this.needsForcedSwitch(0) || this.needsForcedSwitch(1)) {
      throw new Error('瀕死のポケモンが残っています。applyForcedSwitchを先に呼んでください');
    }

    this.reasoningLog.push({ turn: this.engine.turn, side: 0, pokemonName: this.activeA.name, reasoning: decisionA.reasoning });
    this.reasoningLog.push({ turn: this.engine.turn, side: 1, pokemonName: this.activeB.name, reasoning: decisionB.reasoning });

    const actionA = decisionA.action;
    const actionB = decisionB.action;

    // 両者が同時に交代する場合も、天候変化特性などのswitch-in効果はすばやさが遅い側が
    // 後に発動して上書きする仕様のため、速い順(=遅い方を最後に)switchInする。
    const switchEntries: { side: 0 | 1; pokemon: Pokemon; team: Pokemon[] }[] = [];
    if (actionA.type === 'switch') {
      if (this.isBlockedByShadowTag(0, this.teamA[actionA.pokemonIndex], actionB)) {
        this.engine.log.push(`${this.activeB.name}のかげふみで交代できない！`);
      } else {
        switchEntries.push({ side: 0, pokemon: this.teamA[actionA.pokemonIndex], team: this.teamA });
      }
    }
    if (actionB.type === 'switch') {
      if (this.isBlockedByShadowTag(1, this.teamB[actionB.pokemonIndex], actionA)) {
        this.engine.log.push(`${this.activeA.name}のかげふみで交代できない！`);
      } else {
        switchEntries.push({ side: 1, pokemon: this.teamB[actionB.pokemonIndex], team: this.teamB });
      }
    }
    for (const entry of this.engine.orderBySpeed(switchEntries)) {
      this.switchTo(entry.side, entry.pokemon, entry.team);
    }

    // メガシンカは技の選択と同時に宣言される「無償の行動」。ダメージ計算前、
    // かつすばやさ比較(素早さが変わりうる)より前に解決する。
    if (actionA.type === 'move' && actionA.megaEvolve && this.megaEvolutionSystem.canMegaEvolve(this.activeA)) {
      this.megaEvolutionSystem.megaEvolve(this.activeA);
      this.engine.log.push(`${this.activeA.name}はメガシンカした！`);
    }
    if (actionB.type === 'move' && actionB.megaEvolve && this.megaEvolutionSystem.canMegaEvolve(this.activeB)) {
      this.megaEvolutionSystem.megaEvolve(this.activeB);
      this.engine.log.push(`${this.activeB.name}はメガシンカした！`);
    }

    const attackers: { side: 0 | 1; pokemon: Pokemon }[] = [];
    if (actionA.type === 'move') attackers.push({ side: 0, pokemon: this.activeA });
    if (actionB.type === 'move') attackers.push({ side: 1, pokemon: this.activeB });

    this.pendingTurn = {
      actionA,
      actionB,
      remainingSides: this.engine.orderBySpeed(attackers).map(({ side }) => side),
      awaitingPivotSide: null,
    };
    this.runRemainingMoves();
  }

  // 技フェーズを進める。pivot技が成立したらそこで中断して交代先の入力を待つ
  // （呼び出し側がapplyPivotSwitchで再開する）。最後まで進んだらpendingTurnをnullに戻す。
  private runRemainingMoves(): void {
    const pending = this.pendingTurn;
    if (pending === null || pending.awaitingPivotSide !== null) return;

    while (pending.remainingSides.length > 0) {
      const side = pending.remainingSides.shift()!;
      const attacker = side === 0 ? this.activeA : this.activeB;
      const defender = side === 0 ? this.activeB : this.activeA;
      if (attacker.isFainted || defender.isFainted) continue;

      const action = side === 0 ? pending.actionA : pending.actionB;
      if (action.type !== 'move') continue;

      const result = this.engine.useMove(attacker, defender, attacker.moves[action.moveIndex]);
      // こだわり系は「技を出した時点」で固定される（外した場合も固定される）。
      attacker.lockMove(action.moveIndex);

      if (this.isFinished()) break;

      // pivot技は交代先を「技の解決を見てから」選べるのが強みなので、ここで中断して入力を待つ。
      // 控えが全員瀕死なら交代しようがないため、そのまま続行する（本編仕様）。
      if (result.pivot && this.hasAvailableBench(side)) {
        pending.awaitingPivotSide = side;
        return;
      }
    }

    this.pendingTurn = null;
  }

  private hasAvailableBench(side: 0 | 1): boolean {
    const team = side === 0 ? this.teamA : this.teamB;
    const active = side === 0 ? this.activeA : this.activeB;
    return team.some((pokemon) => !pokemon.isFainted && pokemon !== active);
  }

  // pivot技を使った側の交代先を適用し、ターンの残りを再開する。
  // needsPivotSwitch(side)がtrueの間だけ有効。
  applyPivotSwitch(side: 0 | 1, decision: AgentDecision): void {
    if (!this.needsPivotSwitch(side)) {
      throw new Error(`side=${side}はpivot技による交代先の入力待ちではありません`);
    }
    if (decision.action.type !== 'switch') {
      throw new Error(`side=${side}はpivot交代が必要ですが、switch以外の行動が渡されました: ${JSON.stringify(decision.action)}`);
    }

    const team = side === 0 ? this.teamA : this.teamB;
    const active = side === 0 ? this.activeA : this.activeB;
    const replacement = team[decision.action.pokemonIndex];

    if (!replacement || replacement.isFainted || replacement === active) {
      throw new Error(`side=${side}のpivot交代先が不正です: index=${decision.action.pokemonIndex}`);
    }

    this.reasoningLog.push({ turn: this.engine.turn, side, pokemonName: active.name, reasoning: decision.reasoning });
    this.switchTo(side, replacement, team);

    this.pendingTurn!.awaitingPivotSide = null;
    this.runRemainingMoves();
  }

  // ターン終了処理（状態異常・天候ダメージ・持ち物）。次のbeginTurn()に備える。
  endTurn(): void {
    if (!this.isTurnComplete()) {
      throw new Error('技フェーズが完了していません。applyPivotSwitchを先に呼んでください');
    }
    this.engine.endTurn(this.teamA, this.teamB);
    this.turnBegun = false;
  }

  // beginTurn -> (必要なら強制交代) -> 両者の行動取得 -> applyTurn -> endTurn を
  // BattleAgent任せで一括実行する便利メソッド。
  async playTurn(agentA: BattleAgent, agentB: BattleAgent): Promise<void> {
    this.beginTurn();

    if (this.needsForcedSwitch(0)) {
      this.applyForcedSwitch(0, await agentA.selectAction(this.getContext(0)));
    }
    if (this.needsForcedSwitch(1)) {
      this.applyForcedSwitch(1, await agentB.selectAction(this.getContext(1)));
    }

    if (this.isFinished()) {
      this.endTurn();
      return;
    }

    const [decisionA, decisionB] = await Promise.all([
      agentA.selectAction(this.getContext(0)),
      agentB.selectAction(this.getContext(1)),
    ]);

    this.applyTurn(decisionA, decisionB);

    // pivot技は交代先を技の解決後に選ぶため、完了するまで該当エージェントに問い合わせる
    // （両者がpivot技を選ぶと1ターンに2回発生しうる）。
    let pivotSide = this.pendingPivotSide();
    while (pivotSide !== null) {
      const agent = pivotSide === 0 ? agentA : agentB;
      this.applyPivotSwitch(pivotSide, await agent.selectAction(this.getContext(pivotSide)));
      pivotSide = this.pendingPivotSide();
    }

    this.endTurn();
  }
}

// undo/redoの履歴管理。BattleSession自体はundo方針を知らないため、
// 「playTurnの前にチェックポイントを取る」という方針だけをここに切り出している。
export class BattleHistory {
  session: BattleSession;
  private past: BattleSnapshot[] = [];
  private future: BattleSnapshot[] = [];

  constructor(session: BattleSession) {
    this.session = session;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  // 現在の状態をundoスタックに積む。playTurn以外の経路（例:
  // MCPサーバーのようにクライアントが決めた行動をsessionへ直接適用する場合）で
  // 履歴管理だけを流用したいときに使う。
  checkpoint(): void {
    this.past.push(this.session.snapshot());
    this.future = [];
  }

  async playTurn(agentA: BattleAgent, agentB: BattleAgent): Promise<void> {
    this.checkpoint();
    await this.session.playTurn(agentA, agentB);
  }

  undo(): void {
    if (!this.canUndo()) {
      throw new Error('undoできる履歴がありません');
    }
    this.future.push(this.session.snapshot());
    this.session.restore(this.past.pop()!);
  }

  redo(): void {
    if (!this.canRedo()) {
      throw new Error('redoできる履歴がありません');
    }
    this.past.push(this.session.snapshot());
    this.session.restore(this.future.pop()!);
  }

  // 現在の局面から独立した新しい履歴付きセッションを作る（分岐探索用）。
  fork(): BattleHistory {
    return new BattleHistory(this.session.fork());
  }
}

export interface RunBattleOptions extends StartSessionOptions {
  maxTurns?: number;
}

// 決着まで一気に回す便利関数。BattleSession.playTurn()をループで呼ぶだけの薄いラッパー。
export async function runBattle(
  teamA: Pokemon[],
  teamB: Pokemon[],
  agentA: BattleAgent,
  agentB: BattleAgent,
  options: RunBattleOptions = {}
): Promise<BattleResult> {
  const maxTurns = options.maxTurns ?? 50;
  const session = await BattleSession.start(teamA, teamB, options);

  while (!session.isFinished() && session.engine.turn < maxTurns) {
    await session.playTurn(agentA, agentB);
  }

  return {
    winner: session.isFinished() ? session.winner() : null,
    turns: session.engine.turn,
    log: session.engine.getLog(),
    reasoningLog: session.reasoningLog,
  };
}
