import { BattleEngine } from './battle-engine.js';
import type { Pokemon } from './pokemon.js';
import type { BattleAgent, BattleContext, AgentDecision } from './ai/battle-agent.js';
import { snapshotBattle, restoreBattle } from './battle-snapshot.js';
import type { BattleSnapshot } from './battle-snapshot.js';

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
  opponentTeam: Pokemon[]
): BattleContext {
  return {
    turn: engine.turn,
    self,
    selfTeam,
    opponent,
    opponentTeam,
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
  reasoningLog: TurnReasoning[] = [];
  private turnBegun = false;

  private constructor(engine: BattleEngine, teamA: Pokemon[], teamB: Pokemon[], activeA: Pokemon, activeB: Pokemon) {
    this.engine = engine;
    this.teamA = teamA;
    this.teamB = teamB;
    this.activeA = activeA;
    this.activeB = activeB;
  }

  static async start(teamA: Pokemon[], teamB: Pokemon[], options: StartSessionOptions = {}): Promise<BattleSession> {
    const engine = options.engine ?? new BattleEngine();
    const leadA = options.leadA ?? teamA[0];
    const leadB = options.leadB ?? teamB[0];

    engine.setActivePokemon(0, leadA);
    engine.setActivePokemon(1, leadB);
    const activeA = engine.switchIn(leadA, teamA, 0);
    const activeB = engine.switchIn(leadB, teamB, 1);

    return new BattleSession(engine, teamA, teamB, activeA, activeB);
  }

  static fromSnapshot(snapshot: BattleSnapshot): BattleSession {
    const { engine, teamA, teamB, activeA, activeB } = restoreBattle(snapshot);
    return new BattleSession(engine, teamA, teamB, activeA, activeB);
  }

  snapshot(): BattleSnapshot {
    return snapshotBattle(this.engine, this.teamA, this.teamB, this.activeA, this.activeB);
  }

  // 現在の状態にsnapshotを反映する（undo/redoの実体）。
  restore(snapshot: BattleSnapshot): void {
    const { engine, teamA, teamB, activeA, activeB } = restoreBattle(snapshot);
    this.engine = engine;
    this.teamA = teamA;
    this.teamB = teamB;
    this.activeA = activeA;
    this.activeB = activeB;
    this.turnBegun = false;
  }

  // 現在の状態から独立した別セッションを作る（分岐探索用）。
  // structuredCloneでスナップショットを複製してから復元するため、参照を共有しない。
  fork(): BattleSession {
    const session = BattleSession.fromSnapshot(structuredClone(this.snapshot()));
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

  getContext(side: 0 | 1): BattleContext {
    return side === 0
      ? buildContext(this.engine, 0, this.activeA, this.teamA, this.activeB, this.teamB)
      : buildContext(this.engine, 1, this.activeB, this.teamB, this.activeA, this.teamA);
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
    this.engine.setActivePokemon(side, replacement);
    const switched = this.engine.switchIn(replacement, team, side);

    if (side === 0) this.activeA = switched;
    else this.activeB = switched;
  }

  // 両陣営が同時に選んだ行動を適用する。交代は素早さに関係なく先に解決し、
  // 技はその場に出ている側のcalculateSpeed順（トリックルーム込み）に実行する。
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

    if (actionA.type === 'switch') {
      this.activeA = this.teamA[actionA.pokemonIndex];
      this.engine.setActivePokemon(0, this.activeA);
      this.activeA = this.engine.switchIn(this.activeA, this.teamA, 0);
    }
    if (actionB.type === 'switch') {
      this.activeB = this.teamB[actionB.pokemonIndex];
      this.engine.setActivePokemon(1, this.activeB);
      this.activeB = this.engine.switchIn(this.activeB, this.teamB, 1);
    }

    const attackingSides: (0 | 1)[] = [];
    if (actionA.type === 'move') attackingSides.push(0);
    if (actionB.type === 'move') attackingSides.push(1);
    attackingSides.sort(
      (a, b) =>
        this.engine.calculateSpeed(b === 0 ? this.activeA : this.activeB)
        - this.engine.calculateSpeed(a === 0 ? this.activeA : this.activeB)
    );

    for (const side of attackingSides) {
      const attacker = side === 0 ? this.activeA : this.activeB;
      const defender = side === 0 ? this.activeB : this.activeA;
      if (attacker.isFainted || defender.isFainted) continue;

      const action = side === 0 ? actionA : actionB;
      if (action.type !== 'move') continue;

      this.engine.useMove(attacker, defender, attacker.moves[action.moveIndex]);
      if (this.isFinished()) break;
    }
  }

  // ターン終了処理（状態異常・天候ダメージ・持ち物）。次のbeginTurn()に備える。
  endTurn(): void {
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
