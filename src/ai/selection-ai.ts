import type { MoveAction, SwitchAction, ForfeitAction } from '../types.js';
import type { Pokemon } from '../pokemon.js';
import type { Team } from '../team.js';

export interface TeamAnalysis {
  archetype: string;
  recommendation: string;
}

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

  selectLead(team: Team): Pokemon {
    return team.members[0];
  }

  selectMove(pokemon: Pokemon, _opponent: Pokemon): MoveAction {
    const availableMoves = pokemon.moves.filter((_, i) => pokemon.canUseMove(i));
    const randomIndex = Math.floor(Math.random() * availableMoves.length);
    const move = availableMoves[randomIndex];
    const moveIndex = pokemon.moves.indexOf(move);

    return { type: 'move', moveIndex, target: 0 };
  }

  selectSwitch(team: Team): SwitchAction | ForfeitAction {
    const available = team.getAvailableSwitches();
    if (available.length === 0) {
      return { type: 'forfeit' };
    }
    return { type: 'switch', pokemonIndex: available[0].index };
  }
}
