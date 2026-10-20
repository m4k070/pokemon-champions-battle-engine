import type { Pokemon } from '../pokemon.js';
import type { TypeName } from '../types.js';
import { TYPE_CHART } from '../type-chart.js';

// 選出（シングル3体）のルールベース実装。
//
// これまでエンジンには「選出」が無く、6体をそのまま持ち込んでいた。そのため
//   ・初手の並び順が勝率を支配する（メガ枠が先頭かどうかで結果が変わる）
//   ・構築記事の「基本選出」（例: イエッサン初手／オオニューラ／メガカメックス）を表現できない
// という問題があった。ここでは 6体から3体を選び、選んだ順をそのまま選出順として返す。
//
// 判断は「場を整える役 → エース（メガ）→ 詰め」の3段。相手の情報が無い前提なので、
// タイプ相性の網羅性と数値の太さで埋める。乱数は使わない（再現性を優先）。

const SETTER_ABILITIES = new Set([
  'drizzle', 'drought', 'sand-stream', 'snow-warning', 'sand-spit',
  'psychic-surge', 'electric-surge', 'grassy-surge', 'misty-surge',
]);

const SETUP_MOVE_NAMES = new Set([
  'つるぎのまい', 'りゅうのまい', 'てっぺき', 'ちょうのまい', 'わるだくみ', 'からをやぶる', 'めいそう',
]);

const ALL_TYPES: TypeName[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

function weaknessMultiplier(pokemon: Pokemon, attackType: TypeName): number {
  let multiplier = 1;
  for (const defenderType of pokemon.types) {
    const value = TYPE_CHART[attackType]?.[defenderType];
    multiplier *= typeof value === 'number' ? value : 1;
  }
  return multiplier;
}

// そのポケモンが「4倍弱点」を持つならそのタイプを返す（無ければ null）。
function fourTimesWeakness(pokemon: Pokemon): TypeName | null {
  for (const type of ALL_TYPES) {
    if (weaknessMultiplier(pokemon, type) >= 4) return type;
  }
  return null;
}

function isMegaHolder(pokemon: Pokemon): boolean {
  return pokemon.item !== null && /ite(-z)?$/.test(pokemon.item);
}

function hasSetupMove(pokemon: Pokemon): boolean {
  return pokemon.moves.some((move) => SETUP_MOVE_NAMES.has(move.name));
}

function isSetter(pokemon: Pokemon): boolean {
  return SETTER_ABILITIES.has(pokemon.ability);
}

// 攻撃範囲の広さ（通る相手のタイプ数）。等倍以上で数える。
function coverage(pokemon: Pokemon): number {
  const damageMoves = pokemon.moves.filter((move) => move.category !== 'status');
  let score = 0;
  for (const type of ALL_TYPES) {
    const best = Math.max(0, ...damageMoves.map((move) => {
      const attackType = move.type;
      let multiplier = 1;
      for (const defenderType of [type]) {
        const value = TYPE_CHART[attackType]?.[defenderType];
        multiplier *= typeof value === 'number' ? value : 1;
      }
      return multiplier >= 1 ? 1 : 0;
    }));
    score += best;
  }
  return score;
}

// 詰め枠の評価。数値の太さ・攻撃範囲・積み技・速度を見る。
function fillerScore(pokemon: Pokemon): number {
  const bulk = pokemon.maxHP + pokemon.stats.DEF + pokemon.stats.SPDEF;
  const offense = Math.max(pokemon.stats.ATK, pokemon.stats.SPATK);
  return coverage(pokemon) * 12 + bulk * 0.18 + offense * 0.25
    + (hasSetupMove(pokemon) ? 35 : 0) + (pokemon.stats.SPEED >= 100 ? 20 : 0);
}

// 構築記事の「基本選出」（例: '基本選出: イエッサン(オス)（初手）／オオニューラ など／メガカメックス'）を
// メンバー名に解決する。表記ゆれ（「メガ」接頭辞・「など」・括弧書き）を落として照合する。
function normalizeName(raw: string): string {
  return raw
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/など/g, '')
    .replace(/^メガ/, '')
    .replace(/\s+/g, '')
    .trim();
}

export interface BasicSelectionSource {
  basicSelection: string;
  members: { name: string; displayName?: string }[];
}

// 基本選出テキストを選出順のメンバーに解決する。解決できた順に返す（足りない分は呼び出し側で補う）。
export function resolveBasicSelection(
  source: BasicSelectionSource,
  pokemons: Pokemon[],
): Pokemon[] {
  // 「基本選出:」「メガラグラージ選出:」など、前置きのラベルを取り除く。
  const text = source.basicSelection.replace(/^[^:：]{0,20}選出[:：]/, '');
  const tokens = text.split(/[／/]/).map((token) => normalizeName(token)).filter(Boolean);
  const picked: Pokemon[] = [];
  for (const token of tokens) {
    const index = source.members.findIndex((member, i) => {
      if (pokemons[i] === undefined) return false;
      const display = normalizeName(member.displayName ?? member.name);
      const id = normalizeName(member.name);
      return token === display || token === id || token.includes(display) || display.includes(token);
    });
    if (index >= 0 && !picked.includes(pokemons[index]!)) picked.push(pokemons[index]!);
  }
  return picked;
}

// 基本選出を優先し、足りない枠をルールで埋める。
export function selectTeamWithPlan(
  source: BasicSelectionSource,
  pokemons: Pokemon[],
  size = 3,
): { members: Pokemon[]; reason: string[] } {
  const fromPlan = resolveBasicSelection(source, pokemons);
  const filler = selectTeam(pokemons, size);
  const members = [...fromPlan];
  const reason = fromPlan.map((pokemon) => `基本選出: ${pokemon.name}`);
  for (const candidate of filler.members) {
    if (members.length >= size) break;
    if (!members.includes(candidate)) {
      members.push(candidate);
      reason.push(`補完: ${candidate.name}`);
    }
  }
  return { members: members.slice(0, size), reason };
}

export interface TeamSelection {
  members: Pokemon[];
  reason: string[];
}

// 6体（またはそれ以上）から3体を選ぶ。返り値の順序が選出順（先頭が初手）。
export function selectTeam(team: Pokemon[], size = 3): TeamSelection {
  const picked: Pokemon[] = [];
  const reasons: string[] = [];

  // 1) 場を整える役（あめふらし・サイコメイカー等）を初手に置く。
  const setter = team.find((pokemon) => isSetter(pokemon) && !pokemon.isFainted);
  if (setter) {
    picked.push(setter);
    reasons.push(`初手: ${setter.name}（${setter.ability} で場を整える）`);
  }

  // 2) メガ枠を確保する。既に始動役がメガ持ちならそれを流用する。
  const mega = picked.find((pokemon) => isMegaHolder(pokemon))
    ?? team.find((pokemon) => isMegaHolder(pokemon) && !picked.includes(pokemon));
  if (mega && !picked.includes(mega)) {
    picked.push(mega);
    reasons.push(`エース: ${mega.name}（${mega.item}）`);
  }

  // 3) 残りを詰め枠で埋める。同じ4倍弱点は避ける。
  const usedWeaknesses = new Set(picked.map((pokemon) => fourTimesWeakness(pokemon)).filter(Boolean));
  const candidates = team
    .filter((pokemon) => !picked.includes(pokemon) && !pokemon.isFainted)
    .map((pokemon) => {
      const weakness = fourTimesWeakness(pokemon);
      const penalty = weakness && usedWeaknesses.has(weakness) ? -80 : 0;
      return { pokemon, score: fillerScore(pokemon) + penalty, weakness };
    })
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (picked.length >= size) break;
    picked.push(candidate.pokemon);
    if (candidate.weakness) usedWeaknesses.add(candidate.weakness);
    reasons.push(`詰め: ${candidate.pokemon.name}（score ${candidate.score.toFixed(1)}）`);
  }

  return { members: picked.slice(0, size), reason: reasons };
}
