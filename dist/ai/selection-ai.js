export class SelectionAI {
    analyzeTeam(team) {
        const types = team.members.flatMap((p) => p.types);
        const uniqueTypes = [...new Set(types)];
        let archetype = 'balanced';
        if (uniqueTypes.length <= 2) {
            archetype = 'monotype';
        }
        else if (team.members.every((p) => p.stats.SPEED > 100)) {
            archetype = 'hyper-offense';
        }
        else if (team.members.every((p) => p.stats.HP > 100)) {
            archetype = 'stall';
        }
        return {
            archetype,
            recommendation: `Detected archetype: ${archetype}`,
        };
    }
    selectLead(team) {
        return team.members[0];
    }
    selectMove(pokemon, _opponent) {
        const availableMoves = pokemon.moves.filter((_, i) => pokemon.canUseMove(i));
        const randomIndex = Math.floor(Math.random() * availableMoves.length);
        const move = availableMoves[randomIndex];
        const moveIndex = pokemon.moves.indexOf(move);
        return { type: 'move', moveIndex, target: 0 };
    }
    selectSwitch(team) {
        const available = team.getAvailableSwitches();
        if (available.length === 0) {
            return { type: 'forfeit' };
        }
        return { type: 'switch', pokemonIndex: available[0].index };
    }
}
//# sourceMappingURL=selection-ai.js.map