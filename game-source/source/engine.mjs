// The host alone applies this reducer. Guest clients submit intents, never boards.
export const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const validCode=c=>typeof c==='string'&&/^[A-HJ-NP-Z2-9]{6}$/.test(c);
export const peerId=code=>'tower-tactics-v1-'+code;
export const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>ALPHABET[n%32]).join('');
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
export const initialState=()=>({version:0,board:Array(9).fill(null),turn:'X',starter:'X',round:1,result:null,line:[],votes:[],scores:[0,0,0],players:[true,false]});
const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function reduce(state,seat,command){
 if(seat!==0&&seat!==1)throw Error('Invalid seat.');
 if(!command||command.version!==state.version||command.round!==state.round)throw Error('The board changed. Try again.');
 if(!state.players[1])throw Error('Wait for your friend to join.');
 const s=structuredClone(state);
 if(command.action==='move'){
  if(s.result)throw Error('This round is finished.');
  if(s.turn!==(seat===0?'X':'O'))throw Error('It is your rival’s turn.');
  const i=command.cell;
  if(!Number.isInteger(i)||i<0||i>8)throw Error('Invalid square.');
  if(s.board[i])throw Error('That square is already taken.');
  s.board[i]=s.turn;
  const line=lines.find(l=>l.every(j=>s.board[j]===s.turn));
  if(line){s.result=s.turn;s.line=line;s.scores[seat]++;}
  else if(s.board.every(Boolean)){s.result='draw';s.scores[2]++;}
  else s.turn=s.turn==='X'?'O':'X';
 }else if(command.action==='rematch'){
  if(!s.result)throw Error('Finish the round first.');
  if(s.votes.includes(seat))return state;
  s.votes.push(seat);
  if(s.votes.length===2){s.round++;s.starter=s.starter==='X'?'O':'X';s.turn=s.starter;s.board=Array(9).fill(null);s.result=null;s.line=[];s.votes=[];}
 }else throw Error('Unknown action.');
 s.version++;return s;
}
export function validState(s){return !!s&&Number.isSafeInteger(s.version)&&s.version>=0&&Number.isSafeInteger(s.round)&&s.round>0&&Array.isArray(s.board)&&s.board.length===9&&s.board.every(v=>v===null||v==='X'||v==='O')&&['X','O'].includes(s.turn)&&['X','O'].includes(s.starter)&&[null,'X','O','draw'].includes(s.result)&&Array.isArray(s.players)&&s.players.length===2&&s.players.every(v=>typeof v==='boolean')&&Array.isArray(s.scores)&&s.scores.length===3&&s.scores.every(v=>Number.isSafeInteger(v)&&v>=0)&&Array.isArray(s.votes)&&s.votes.length<=2&&s.votes.every(v=>v===0||v===1)&&Array.isArray(s.line)&&s.line.length<=3&&s.line.every(v=>Number.isInteger(v)&&v>=0&&v<9);}
