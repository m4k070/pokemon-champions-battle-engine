export type {
  TypeName,
  MoveCategory,
  StatusCondition,
  WeatherType,
  StatKey,
  BaseStats,
  Stats,
  StatStageKey,
  StatStages,
  FieldEffect,
  SecondaryStatusEffect,
  SelfStatChange,
  TargetStatChange,
  MoveData,
  DamageMoveData,
  PhysicalMoveData,
  SpecialMoveData,
  StatusMoveData,
  CommonMoveEffects,
  DamageOnlyEffects,
  TypeChart,
  BattleEventName,
  EventData,
  EventHandler,
  MoveAction,
  SwitchAction,
  ForfeitAction,
  AgentAction,
} from './types.js';

export { EventEmitter } from './event-emitter.js';
export { Pokemon } from './pokemon.js';
export type { PokémonConstructorData } from './pokemon.js';
export {
  PhysicalMove,
  SpecialMove,
  StatusMove,
  createMove,
  cloneDamageMove,
  isDamageMove,
  isStatusMove,
  isPhysicalMove,
  isSpecialMove,
  targetsOpponent,
} from './move.js';
export type { Move, DamageMove, MoveInput, DamageMoveInput, StatusMoveInput, MoveConstructorData } from './move.js';
export { NO_STATUS, createStatusState, statusConditionOf, cloneStatusState } from './status-state.js';
export type { StatusState } from './status-state.js';
export { ABILITY_NAMES, isAbilityName } from './ability-names.js';
export type { AbilityName } from './ability-names.js';
export { ITEM_NAMES, isItemName } from './item-names.js';
export type { ItemName } from './item-names.js';
export { Team } from './team.js';
export type { SwitchOption } from './team.js';
export { BattleField } from './battle-field.js';
export type { SideHazards, SideFlags } from './battle-field.js';
export { BattleEngine } from './battle-engine.js';
export type { UseMoveResult } from './battle-engine.js';

export { StatPointSystem, Level50System, MegaEvolutionSystem, MEGA_STONE_SEEDS } from './rules/index.js';
export type {
  StatPointsData,
  MegaStoneConfig,
  MegaStoneSeed,
  MegaStatKey,
  MegaStatBoosts,
  PokemonDataFetcher,
} from './rules/index.js';

export { ABILITY_REGISTRY, getAbilityDefinition, BULLETPROOF, isBallOrBombMove } from './rules/index.js';
export type { AbilityDefinition, AbilitySwitchInContext } from './rules/index.js';

export { SelectionAI } from './ai/selection-ai.js';
export type { TeamAnalysis } from './ai/selection-ai.js';

export { RandomBattleAgent, getLegalActions } from './ai/battle-agent.js';
export type { BattleAgent, BattleContext, BattleFieldView, StealthRockView, AgentDecision, LegalActions } from './ai/battle-agent.js';

export { OpenCodeBattleAgent, buildBattlePrompt } from './ai/opencode-battle-agent.js';
export type { OpenCodeBattleAgentOptions } from './ai/opencode-battle-agent.js';

export { snapshotBattle, restoreBattle, snapshotPokemon, restorePokemon } from './battle-snapshot.js';
export type { BattleSnapshot, PokemonSnapshot, FieldSnapshot, SessionSnapshot, PendingTurn, RestoredBattle } from './battle-snapshot.js';

export { BattleSession, BattleHistory, runBattle } from './battle-runner.js';
export type { StartSessionOptions, RunBattleOptions, BattleResult, TurnReasoning } from './battle-runner.js';

export { PokemonDataCache, PokemonAPI } from './api/pokemon-api.js';
export type { PokeApiPokemonData, PokeApiMoveData } from './api/pokemon-api.js';

export { META_TEAMS } from './data/meta-teams.js';
export type { MetaTeamEntry } from './data/meta-teams.js';
