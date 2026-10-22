import { Pokemon } from '../src/pokemon.js';
import { createMove } from '../src/move.js';
import { HybridBattleAgent } from '../src/ai/hybrid-battle-agent.js';
import { typeMultiplier } from '../src/ai/heuristic-battle-agent.js';
import { SeededRandom } from '../src/rng.js';

const self = new Pokemon({ name:'エース', types:['normal'], ability:'none',
  baseStats:{HP:150,ATK:100,DEF:100,SPATK:100,SPDEF:100,SPEED:100},
  moves:[createMove({name:'たいあたり',type:'normal',power:60,accuracy:100,pp:20,category:'physical'}),
         createMove({name:'ずつき',type:'normal',power:60,accuracy:100,pp:20,category:'physical'})]});
const bench = new Pokemon({ name:'受け', types:['normal'], ability:'none',
  baseStats:{HP:150,ATK:100,DEF:100,SPATK:100,SPDEF:100,SPEED:100},
  moves:[createMove({name:'たいあたり',type:'normal',power:60,accuracy:100,pp:20,category:'physical'})]});
const opponent = new Pokemon({ name:'相手', types:['electric'], ability:'none',
  baseStats:{HP:150,ATK:100,DEF:100,SPATK:100,SPDEF:100,SPEED:100},
  moves:[createMove({name:'でんげき',type:'fighting',power:60,accuracy:100,pp:20,category:'physical'})]});
self.currentHP = Math.floor(self.maxHP*0.8);
const ctx:any = { turn:2, self, selfTeam:[self,bench], opponent, opponentTeam:[opponent],
  canMegaEvolve:false, mustSwitch:false,
  field:{weather:null,weatherTurnsLeft:0,terrain:null,terrainTurnsLeft:0,trickRoom:false,trickRoomTurnsLeft:0,stealthRock:{self:false,opponent:false}},
  recentLog:[] };
console.log('effectiveness:', typeMultiplier('fighting', ['normal']));
console.log('opponent moves:', ctx.opponent.moves.length);
const agent = new HybridBattleAgent(new SeededRandom(1), { apiKey:'x', triggers:['単一技の読み'], ask: async()=> '{"agree":true}' });
await agent.selectAction(ctx);
console.log('consultations:', agent.consultations.length);
console.log('inner evaluation:', JSON.stringify((agent as any).inner.lastEvaluation));
console.log('margin:', (agent as any).margin());
