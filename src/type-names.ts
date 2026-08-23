import type { TypeName } from './types.js';

// タイプ名の単一の情報源。TypeName の実体はここで列挙する。
export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;

const TYPE_NAME_SET: ReadonlySet<string> = new Set(TYPE_NAMES);

// 外部データ（Poke API のレスポンス等）が既知のタイプ名かを検証する。
export function isTypeName(value: string): value is TypeName {
  return TYPE_NAME_SET.has(value);
}
