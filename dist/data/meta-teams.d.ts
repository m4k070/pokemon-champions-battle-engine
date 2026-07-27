import type { MoveData, TypeName } from '../types.js';
import type { BaseStats } from '../types.js';
export interface MetaTeamEntry {
    name: string;
    pokemon: {
        name: string;
        types: TypeName[];
        ability: string;
        item: string | null;
        baseStats: BaseStats;
        moves: MoveData[];
    }[];
}
export declare const META_TEAMS: MetaTeamEntry[];
//# sourceMappingURL=meta-teams.d.ts.map