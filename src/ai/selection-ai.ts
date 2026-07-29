import type { Team } from '../team.js';

export interface TeamAnalysis {
  archetype: string;
  recommendation: string;
}

// 毎ターンの行動選択は BattleAgent（RandomBattleAgent / LLM実装）が担う。
// SelectionAIはチーム全体のアーキタイプ判定のみを担当する。
export class SelectionAI {
  analyzeTeam(team: Team): TeamAnalysis {
    const types = team.members.flatMap((p) => p.types);
    const uniqueTypes = [...new Set(types)];

    let archetype = 'balanced';
    if (uniqueTypes.length <= 2) {
      archetype = 'monotype';
    } else if (team.members.every((p) => p.stats.SPEED > 100)) {
      archetype = 'hyper-offense';
    } else if (team.members.every((p) => p.stats.HP > 100)) {
      archetype = 'stall';
    }

    return {
      archetype,
      recommendation: `Detected archetype: ${archetype}`,
    };
  }
}
