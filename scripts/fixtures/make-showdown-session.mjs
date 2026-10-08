// Makes scripts/fixtures/showdown-session.json: one player's evening of VGC-style doubles (bring 4 of 6, level 50)
// with the same team every game against opponents on common Trick Room, sun and Tailwind teams, as the Showdown web client receives and sends it
// over its WebSocket. The official simulator plays both sides with its random player (seeded, so the file is
// reproducible); the player picks a different four each game. Used by scripts/game-review-check.ts (#1598), where team
// building only means something if the team stays the same. Run: npm i --no-save pokemon-showdown@0.11.11 && node scripts/fixtures/make-showdown-session.mjs
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {BattleStream,getPlayerStreams,Teams,PRNG}=require('pokemon-showdown');
const {RandomPlayerAI}=require('pokemon-showdown/dist/sim/tools/random-player-ai');

// The player's team: a common VGC core (Fake Out and Intimidate, redirection, a fast attacker and a Trick Room setter).
const TEAM=`Incineroar @ Sitrus Berry
Ability: Intimidate
Tera Type: Grass
EVs: 252 HP / 4 Atk / 116 Def / 132 SpD / 4 Spe
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot

Amoonguss @ Rocky Helmet
Ability: Regenerator
Tera Type: Water
EVs: 252 HP / 196 Def / 60 SpD
Relaxed Nature
- Spore
- Rage Powder
- Pollen Puff
- Protect

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Dazzling Gleam
- Protect

Landorus-Therian @ Choice Scarf
Ability: Intimidate
Tera Type: Flying
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Stomping Tantrum
- Rock Slide
- U-turn
- Stone Edge

Kingambit @ Black Glasses
Ability: Defiant
Tera Type: Dark
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Kowtow Cleave
- Sucker Punch
- Iron Head
- Protect

Indeedee-F @ Psychic Seed
Ability: Psychic Surge
Tera Type: Fairy
EVs: 252 HP / 252 Def / 4 SpD
Bold Nature
- Follow Me
- Trick Room
- Helping Hand
- Psychic`;
// The opponents bring common VGC teams of three kinds (Trick Room, sun, Tailwind), each twice.
const set=(species,item,ability,tera,moves,nature='Hardy',evs='252 HP / 252 Atk / 252 SpA / 4 Spe')=>`${species} @ ${item}\nAbility: ${ability}\nTera Type: ${tera}\nEVs: ${evs}\n${nature} Nature\n${moves.map(move=>'- '+move).join('\n')}`;
const TRICK_ROOM=[set('Farigiraf','Electric Seed','Armor Tail','Water',['Trick Room','Psychic Noise','Hyper Voice','Protect'],'Quiet'),set('Ursaluna','Flame Orb','Guts','Normal',['Facade','Headlong Rush','Protect','Earthquake'],'Brave'),set('Torkoal','Charcoal','Drought','Fire',['Eruption','Heat Wave','Earth Power','Protect'],'Quiet'),set('Iron Hands','Assault Vest','Quark Drive','Grass',['Fake Out','Drain Punch','Wild Charge','Heavy Slam'],'Brave'),set('Amoonguss','Sitrus Berry','Regenerator','Water',['Spore','Rage Powder','Pollen Puff','Protect'],'Sassy'),set('Gholdengo','Life Orb','Good as Gold','Steel',['Make It Rain','Shadow Ball','Trick Room','Protect'],'Quiet')].join('\n\n');
const SUN=[set('Torkoal','Charcoal','Drought','Fire',['Eruption','Heat Wave','Solar Beam','Protect'],'Modest'),set('Lilligant-Hisui','Focus Sash','Chlorophyll','Ghost',['Close Combat','Leaf Blade','Sleep Powder','After You'],'Jolly'),set('Walking Wake','Booster Energy','Protosynthesis','Water',['Hydro Steam','Draco Meteor','Flamethrower','Protect'],'Timid'),set('Chi-Yu','Choice Specs','Beads of Ruin','Fire',['Heat Wave','Dark Pulse','Overheat','Snarl'],'Timid'),set('Gouging Fire','Clear Amulet','Protosynthesis','Fairy',['Flare Blitz','Dragon Claw','Burning Bulwark','Howl'],'Adamant'),set('Ogerpon-Hearthflame','Hearthflame Mask','Mold Breaker','Fire',['Ivy Cudgel','Horn Leech','Follow Me','Spiky Shield'],'Jolly')].join('\n\n');
const TAILWIND=[set('Tornadus','Covert Cloak','Prankster','Ghost',['Tailwind','Bleakwind Storm','Taunt','Protect'],'Timid'),set('Urshifu-Rapid-Strike','Mystic Water','Unseen Fist','Water',['Surging Strikes','Close Combat','Aqua Jet','Protect'],'Jolly'),set('Rillaboom','Assault Vest','Grassy Surge','Fire',['Fake Out','Grassy Glide','Wood Hammer','U-turn'],'Adamant'),set('Chien-Pao','Focus Sash','Sword of Ruin','Ghost',['Icicle Crash','Sucker Punch','Sacred Sword','Protect'],'Jolly'),set('Raging Bolt','Booster Energy','Protosynthesis','Fairy',['Thunderclap','Draco Meteor','Thunderbolt','Protect'],'Modest'),set('Incineroar','Safety Goggles','Intimidate','Ghost',['Fake Out','Flare Blitz','Parting Shot','Knock Off'],'Careful')].join('\n\n');
const OPPONENTS=[['Cynthia77',TRICK_ROOM],['LanceVGC',TAILWIND],['MistyTide',SUN],['GaryOak22',TRICK_ROOM],['NemonaRuns',TAILWIND],['IrisDragon',SUN]];
const FORMAT='gen9doublescustomgame@@@Picked Team Size = 4,Adjust Level = 50';
const team=Teams.pack(Teams.import(TEAM));



const SEED=1;
const prng=new PRNG([7,7,7,7]);

async function play(n,[opponent,opposing]){
 const room=`battle-gen9doublescustomgame-22000002${String(n).padStart(2,'0')}`;
 const frames=[{in:`>${room}\n|init|battle\n|title|Ashfox vs. ${opponent}\n|j|☆Ashfox\n|j|☆${opponent}`}];
 const streams=getPlayerStreams(new BattleStream());
 new RandomPlayerAI(streams.p2,{seed:[n+SEED,2,3,4]}).start();
 const ai=new RandomPlayerAI(streams.p1,{seed:[n+SEED,5,6,7]});
 // The player's choices go out the way the client sends them; the simulator's random player decides them.
 let requests=0;
 ai.choose=choice=>{frames.push({out:`${room}|/choose ${choice}|${requests}`});void streams.p1.write(choice);};
 ai.receiveRequest=function(request){
  requests++;
  if(request.teamPreview){const order=[1,2,3,4,5,6].sort(()=>prng.random()-.5).slice(0,4).join('');this.choose('team '+order);return;}
  return RandomPlayerAI.prototype.receiveRequest.call(this,request);
 };
 const done=(async()=>{for await(const chunk of streams.p1){
  frames.push({in:`>${room}\n${chunk}`});
  if(chunk.startsWith('|request|')){const request=JSON.parse(chunk.slice(9));if(!request.wait)ai.receiveRequest(request);}
  if(/^\|(win\||tie\b)/m.test(chunk))break;
 }})();
 const other=Teams.pack(Teams.import(opposing));
 void streams.omniscient.write(`>start ${JSON.stringify({formatid:FORMAT,seed:[n+SEED,1,1,1]})}\n>player p1 ${JSON.stringify({name:'Ashfox',team})}\n>player p2 ${JSON.stringify({name:opponent,team:other})}`);
 await done;
 return {room,opponent,frames};
}

const games=[];
for(const [i,opponent] of OPPONENTS.entries())games.push(await play(i+1,opponent));
fs.writeFileSync(new URL('./showdown-session.json',import.meta.url),JSON.stringify({about:'One evening of VGC-style doubles (bring 4 of 6, level 50): Ashfox brings the same six every game (Incineroar, Amoonguss, Flutter Mane, Landorus-Therian, Kingambit, Indeedee-F) against six opponents who bring common Trick Room, sun and Tailwind teams, as the Showdown web client exchanges it over its WebSocket. Made with the official pokemon-showdown simulator by make-showdown-session.mjs.',games})+'\n');
console.log(games.map(game=>`${game.room} vs ${game.opponent}: ${game.frames.map(f=>f.in??'').join('\n').match(/^\|win\|(.+)$/m)?.[1]??'tie'} (${game.frames.length} frames)`).join('\n'));
