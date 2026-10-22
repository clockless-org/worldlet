/** Pure Sudoku generation and editing decisions. The UI supplies time; no timers or DOM live here. */
const digits=[1,2,3,4,5,6,7,8,9];
const PEERS=Array.from({length:81},(_,i)=>{const r=Math.floor(i/9),c=i%9,br=r-r%3,bc=c-c%3,out=new Set<number>();for(let k=0;k<9;k++){out.add(r*9+k);out.add(k*9+c);out.add((br+Math.floor(k/3))*9+bc+k%3);}out.delete(i);return [...out];});
export const sudokuPeers=(index:number):readonly number[]=>PEERS[index]||[];
function shuffle<T>(values:readonly T[],random:()=>number){const out=[...values];for(let i=out.length-1;i>0;i--){const n=random(),j=Math.floor(Math.max(0,Math.min(.999999999999,Number.isFinite(n)?n:0))*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function valid(grid:readonly number[]){return grid.length===81&&grid.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=9&&(!v||!PEERS[i].some(p=>grid[p]===v)));}
function solve(grid:number[],limit:number,keep=false,random?:()=>number):number{
 let best=-1,options:number[]=[];
 for(let i=0;i<81;i++){if(grid[i])continue;let used=0;for(const p of PEERS[i])used|=1<<grid[p];const free=digits.filter(v=>!(used&1<<v));if(best<0||free.length<options.length){best=i;options=free;if(!free.length)return 0;}}
 if(best<0)return 1;if(random)options=shuffle(options,random);let found=0;
 for(const value of options){grid[best]=value;found+=solve(grid,limit-found,keep,random);if(found>=limit){if(!keep)grid[best]=0;return found;}}grid[best]=0;return found;
}
export function countSudokuSolutions(puzzle:readonly number[],limit=2){return valid(puzzle)?solve([...puzzle],Math.max(1,Math.min(2,Math.floor(limit)||2))):0;}
export function solveSudokuPuzzle(puzzle:readonly number[]):number[]|null{if(!valid(puzzle))return null;const grid=[...puzzle];return solve(grid,1,true)?grid:null;}
export interface SudokuPuzzle {puzzle:readonly number[];solution:readonly number[]}
export function makeSudoku(clues=36,random:()=>number=Math.random):SudokuPuzzle{
 if(!Number.isInteger(clues)||clues<17||clues>81)throw Error('Invalid clue target');
 const solution=Array(81).fill(0);solve(solution,1,true,random);const puzzle=[...solution];let filled=81;
 for(const index of shuffle(Array.from({length:81},(_,i)=>i),random)){if(filled<=clues)break;const value=puzzle[index];puzzle[index]=0;if(solve([...puzzle],2)!==1)puzzle[index]=value;else filled--;}
 return {puzzle,solution};
}
interface SudokuEdit {entry:readonly number[];notes:readonly number[];selected:number}
export interface SudokuState extends SudokuPuzzle,SudokuEdit {notesMode:boolean;history:readonly SudokuEdit[];startedAt:number|null;endedAt:number|null;status:'ready'|'playing'|'solved'}
export function newSudokuState(game:SudokuPuzzle=makeSudoku()):SudokuState{
 if(!valid(game.solution)||game.solution.some(v=>!v)||!valid(game.puzzle)||!game.puzzle.every((v,i)=>!v||v===game.solution[i])||countSudokuSolutions(game.puzzle)!==1)throw Error('Invalid Sudoku puzzle');
 return {puzzle:[...game.puzzle],solution:[...game.solution],entry:Array(81).fill(0),notes:Array(81).fill(0),selected:Math.max(0,game.puzzle.findIndex(v=>!v)),notesMode:false,history:[],startedAt:null,endedAt:null,status:game.puzzle.every(Boolean)?'solved':'ready'};
}
export const sudokuRemaining=(state:SudokuState)=>state.puzzle.reduce((n,v,i)=>n+(!v&&!state.entry[i]?1:0),0);
export const elapsedSudokuSeconds=(state:SudokuState,now:number)=>state.startedAt===null?0:Math.max(0,Math.floor(((state.endedAt??now)-state.startedAt)/1000));
export const sudokuConflict=(state:SudokuState,index:number)=>!state.puzzle[index]&&!!state.entry[index]&&PEERS[index].some(p=>(state.puzzle[p]||state.entry[p])===state.entry[index]);
export type SudokuAction={type:'select';index:number}|{type:'put';value:number;now:number}|{type:'notes'}|{type:'undo'};
export function editSudoku(state:SudokuState,action:SudokuAction):SudokuState{
 if(action.type==='select')return Number.isInteger(action.index)&&action.index>=0&&action.index<81?{...state,selected:action.index}:state;
 if(action.type==='notes')return state.status==='solved'?state:{...state,notesMode:!state.notesMode};
 if(action.type==='undo'){const previous=state.history.at(-1);return previous?{...state,...previous,history:state.history.slice(0,-1),status:state.startedAt===null?'ready':'playing',endedAt:null}:state;}
 const index=state.selected,value=action.value;
 if(state.status==='solved'||state.puzzle[index]||!Number.isInteger(value)||value<0||value>9||!Number.isFinite(action.now))return state;
 if(!value&&!state.entry[index]&&!state.notes[index]||value&&state.notesMode&&state.entry[index]||value&&!state.notesMode&&state.entry[index]===value)return state;
 const entry=[...state.entry],notes=[...state.notes];
 if(value&&state.notesMode)notes[index]^=1<<value;else{entry[index]=value;notes[index]=0;if(value)for(const peer of PEERS[index])notes[peer]&=~(1<<value);}
 const solved=state.puzzle.every((v,i)=>(v||entry[i])===state.solution[i]);
 return {...state,entry,notes,history:[...state.history.slice(-199),{entry:state.entry,notes:state.notes,selected:index}],startedAt:state.startedAt??action.now,endedAt:solved?action.now:null,status:solved?'solved':'playing'};
}
