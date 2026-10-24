/* Craps Lab engine — true two-dice craps simulation.
   - mulberry32 seeded RNG; two independent d6, NEVER uniform 2-12
   - Come-out / point phase engine, puck ON/OFF
   - Full bet ledger: pass/don't, come/don't come, odds (true odds + unit rules),
     place, buy (vig upfront/on-win), lay (always working), hardways,
     field (2x/3x), one-roll props (any7, anycraps, C&E, horn, hop, big6/8),
     ATS, Fire, Repeater, crapless variant (no dark-side bets)
   - Session: bankroll, win goal, stop-loss, table min/max
   - Batch: N scripted sessions -> win%, mean/median, best/worst, p5/p95,
     P(ruin), P(goal), expected loss vs theoretical
   Plain script (no modules) — works on file:// and GitHub Pages.
*/
'use strict';

/* ---------------- RNG ---------------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rollDice(rng){
  const d1 = 1 + Math.floor(rng()*6), d2 = 1 + Math.floor(rng()*6);
  return {d1, d2, total: d1+d2};
}

/* ---------------- tables ---------------- */
const WAYS = {2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1};
// true odds profit:stake for odds/buy bets
const TRUE_ODDS = {2:[6,1],3:[3,1],4:[2,1],5:[3,2],6:[6,5],8:[6,5],9:[3,2],10:[2,1],11:[3,1],12:[6,1]};
const PLACE_PAYS_STD = {4:[9,5],5:[7,5],6:[7,6],8:[7,6],9:[7,5],10:[9,5]};
const PLACE_PAYS_CRAPLESS = {2:[11,2],3:[11,4],4:[9,5],5:[7,5],6:[7,6],8:[7,6],9:[7,5],10:[9,5],11:[11,4],12:[11,2]};
const LAY_PAYS = {4:[1,2],10:[1,2],5:[2,3],9:[2,3],6:[5,6],8:[5,6]}; // profit:risk
const HARDWAY_PAYS = {4:[7,1],10:[7,1],6:[9,1],8:[9,1]};
// theoretical edge per $1 of resolved action (for expected-loss estimates)
const EDGE = {
  pass:0.0141, dontpass:0.0136, come:0.0141, dontcome:0.0136, odds:0,
  place4:0.0667, place5:0.04, place6:0.0152, place8:0.0152, place9:0.04, place10:0.0667,
  place2:0.0714, place3:0.0625, place11:0.0625, place12:0.0714,
  buy:0.0476, buyOnWin:0.017, buy212:0.0071,
  lay:0.0244, hard4:0.1111, hard6:0.0909, hard8:0.0909, hard10:0.1111,
  field2x:0.0556, field3x:0.0278, anyseven:0.1667, anycraps:0.1111, ce:0.1111,
  horn:0.125, hopEasy:0.1111, hopHard:0.1389, big68:0.0909,
  ats:0.0776, fire:0.20, repeater:0.10,
  passCrapless:0.0538
};
function edgeFor(bet, engine){
  const t = bet.type;
  if(t==='odds') return 0;
  if(t==='pass'||t==='come') return engine.crapless ? EDGE.passCrapless : EDGE.pass;
  if(t==='dontpass'||t==='dontcome') return EDGE.dontpass;
  if(t==='place'){ const k='place'+bet.number; return EDGE[k]!==undefined?EDGE[k]:0.04; }
  if(t==='buy'){
    if(engine.buyVig==='onwin'){
      if(engine.crapless && (bet.number===2||bet.number===12)) return EDGE.buy212;
      return EDGE.buyOnWin;
    }
    return EDGE.buy;
  }
  if(t==='lay') return EDGE.lay;
  if(t==='hardway') return EDGE['hard'+bet.number];
  if(t==='field') return engine.fieldPay==='3x' ? EDGE.field3x : EDGE.field2x;
  if(t==='anyseven') return EDGE.anyseven;
  if(t==='anycraps') return EDGE.anycraps;
  if(t==='ce') return EDGE.ce;
  if(t==='horn') return EDGE.horn;
  if(t==='hop') return bet.meta.hard ? EDGE.hopHard : EDGE.hopEasy;
  if(t==='big68') return EDGE.big68;
  if(t==='ats') return EDGE.ats;
  if(t==='fire') return EDGE.fire;
  if(t==='repeater') return EDGE.repeater;
  return 0;
}

/* ---------------- engine ---------------- */
let BET_ID = 1;

class CrapsEngine {
  constructor(opts){
    opts = opts || {};
    this.rng = mulberry32(opts.seed===undefined ? (Math.random()*1e9)|0 : opts.seed);
    this.crapless = !!opts.crapless;
    this.tableMin = opts.tableMin || 5;
    this.tableMax = opts.tableMax || 1000;
    this.oddsMax = opts.oddsMax || '3-4-5x';   // '3-4-5x' | '2x' | number
    this.fieldPay = opts.fieldPay || '2x';      // '2x' (2&12) | '3x' (12 or 2)
    this.fieldTriple = opts.fieldTriple || 12; // which number pays 3:1 in 3x mode
    this.buyVig = opts.buyVig || 'upfront';     // 'upfront' | 'onwin'
    this.bankroll = opts.bankroll===undefined ? 1000 : opts.bankroll;
    this.startBankroll = this.bankroll;
    this.atsPay = opts.atsPay || {small:34, tall:34, all:174};
    this.firePay = opts.firePay || {4:24, 5:249, 6:999};
    this.repeaterCfg = opts.repeaterCfg || {target:3, pay:{3:10, 4:50}};
    this.phase = 'comeout'; this.point = null;
    this.bets = [];
    this.rolls = 0; this.shooters = 1; this.decisions = 0;
    this.peak = this.bankroll; this.trough = this.bankroll;
    this.action = 0; this.theoretical = 0;
    this.atsSets = null; this.firePoints = null; this.repeaterCount = 0;
    this.log = [];
  }
  _log(msg){ if(this.log.length<5000) this.log.push(msg); }

  /* ----- bet placement ----- */
  _checkTable(amount){
    if(amount < this.tableMin) throw new Error('Below table minimum $'+this.tableMin);
    if(amount > this.tableMax) throw new Error('Above table maximum $'+this.tableMax);
  }
  _debit(amount){
    if(amount > this.bankroll) throw new Error('Insufficient bankroll');
    this.bankroll -= amount;
  }
  _mkbet(type, amount, extra){
    const bet = Object.assign({id: BET_ID++, type, amount, number:null,
      working:true, parentId:null, meta:{}}, extra||{});
    this.bets.push(bet);
    return bet;
  }
  placeBet(type, p){
    p = p || {};
    const amt = p.amount;
    this._checkTable(amt);
    const dark = (type==='dontpass'||type==='dontcome'||type==='lay');
    if(dark && this.crapless) throw new Error('No dark-side bets on crapless tables');
    switch(type){
      case 'pass':
        if(this.phase!=='comeout') throw new Error('Pass line only on come-out');
        this._debit(amt); return this._mkbet('pass', amt);
      case 'dontpass':
        if(this.phase!=='comeout') throw new Error("Don't pass only on come-out");
        this._debit(amt); return this._mkbet('dontpass', amt);
      case 'come': case 'dontcome': {
        if(this.phase!=='point') throw new Error('Come bets only during point phase');
        this._debit(amt);
        const b = this._mkbet(type, amt); b.meta.traveling = true; return b;
      }
      case 'odds': {
        // p.parentId -> line/come bet id
        const parent = this.bets.find(b=>b.id===p.parentId);
        if(!parent) throw new Error('Odds need a parent bet');
        if(this.phase!=='point') throw new Error('Odds only during point phase');
        const num = parent.number || this.point;
        if(!num) throw new Error('No point for odds');
        const max = this._oddsMax(parent.amount, num);
        if(amt > max) throw new Error('Odds exceed max '+max);
        // unit rules
        if((num===6||num===8) && amt%6!==0) throw new Error('6/8 odds must be in $6 units');
        if((num===5||num===9) && amt%2!==0) throw new Error('5/9 odds must be in $2 units');
        this._debit(amt);
        const b = this._mkbet('odds', amt, {number:num, parentId:parent.id});
        if(parent.type==='dontcome'||parent.type==='dontpass') b.meta.lay=true;
        return b;
      }
      case 'place': {
        const n = p.number;
        const valid = this.crapless ? [2,3,4,5,6,8,9,10,11,12] : [4,5,6,8,9,10];
        if(valid.indexOf(n)<0) throw new Error('Invalid place number');
        if((n===6||n===8) && amt%6!==0) throw new Error('Place 6/8 must be in $6 units');
        this._debit(amt); return this._mkbet('place', amt, {number:n});
      }
      case 'buy': {
        const n = p.number;
        const valid = this.crapless ? [2,3,4,10,11,12] : [4,10];
        if(valid.indexOf(n)<0) throw new Error('Buy only offered on '+valid.join('/'));
        this._debit(amt);
        let vig = 0;
        if(this.buyVig==='upfront'){ vig = Math.max(1, Math.ceil(amt*0.05)); this._debit(vig); }
        const b = this._mkbet('buy', amt, {number:n}); b.meta.vigPaid = vig; return b;
      }
      case 'lay': {
        const n = p.number;
        if([4,5,6,8,9,10].indexOf(n)<0) throw new Error('Lay on 4/5/6/8/9/10');
        this._debit(amt);
        const b = this._mkbet('lay', amt, {number:n}); b.working = true; return b; // always working
      }
      case 'hardway': {
        const n = p.number;
        if([4,6,8,10].indexOf(n)<0) throw new Error('Hardways are 4/6/8/10');
        this._debit(amt);
        const b = this._mkbet('hardway', amt, {number:n});
        b.working = (this.phase==='point'); // off on come-out by default
        return b;
      }
      case 'field':
        this._debit(amt); return this._mkbet('field', amt);
      case 'anyseven': this._debit(amt); return this._mkbet('anyseven', amt);
      case 'anycraps': this._debit(amt); return this._mkbet('anycraps', amt);
      case 'ce':
        if(amt%2!==0) throw new Error('C&E must be even ($1 craps + $1 eleven)');
        this._debit(amt); return this._mkbet('ce', amt);
      case 'horn':
        if(amt%4!==0) throw new Error('Horn must be in $4 units');
        this._debit(amt); return this._mkbet('horn', amt);
      case 'hop': {
        const {d1,d2,hard} = p;
        if(d1<1||d1>6||d2<1||d2>6) throw new Error('Hop needs two dice faces');
        this._debit(amt);
        return this._mkbet('hop', amt, {meta:{d1,d2,hard:!!hard}});
      }
      case 'big68': {
        const n = p.number;
        if(n!==6&&n!==8) throw new Error('Big 6/8 only');
        this._debit(amt); return this._mkbet('big68', amt, {number:n});
      }
      case 'ats': {
        const a = p.amounts || {small:1,tall:1,all:1};
        const tot = (a.small||0)+(a.tall||0)+(a.all||0);
        this._debit(tot);
        const b = this._mkbet('ats', tot, {meta:{amounts:a, hitS:new Set(), hitT:new Set()}});
        if(!this.atsSets) this.atsSets = {small:new Set(), tall:new Set()};
        return b;
      }
      case 'fire':
        this._debit(amt);
        if(!this.firePoints) this.firePoints = new Set();
        return this._mkbet('fire', amt);
      case 'repeater': {
        const n = p.number || this.point; // default: current point
        if(!n) throw new Error('Repeater needs a number');
        this._debit(amt);
        return this._mkbet('repeater', amt, {number:n, meta:{count:0}});
      }
      default: throw new Error('Unknown bet type '+type);
    }
  }
  _oddsMax(flat, num){
    if(typeof this.oddsMax === 'number') return flat*this.oddsMax;
    if(this.oddsMax==='2x') return flat*2;
    // 3-4-5x (crapless typically 2x, but allow config)
    if(num===4||num===10) return flat*3;
    if(num===5||num===9) return flat*4;
    return flat*5;
  }
  removeBet(id){
    const i = this.bets.findIndex(b=>b.id===id);
    if(i<0) return 0;
    const b = this.bets[i];
    if(b.type==='odds'){ /* odds can always come down */ }
    this.bets.splice(i,1);
    this.bankroll += b.amount; // stake returned (vig not refunded)
    // remove child odds
    const kids = this.bets.filter(k=>k.parentId===id);
    kids.forEach(k=>this.removeBet(k.id));
    return b.amount;
  }
  takeDownAll(){ const ids=this.bets.map(b=>b.id); let r=0; ids.forEach(id=>{r+=this.removeBet(id);}); return r; }
  setWorking(id, w){
    const b = this.bets.find(b=>b.id===id); if(!b) return;
    if(b.type==='lay') return; // lay bets are ALWAYS working
    b.working = !!w;
  }
  hasBet(type, number){
    return this.bets.find(b=>b.type===type && (number===undefined || b.number===number));
  }
  getBets(type, number){
    return this.bets.filter(b=>b.type===type && (number===undefined || b.number===number));
  }

  /* ----- resolution ----- */
  _pay(bet, profit, note){
    // profit paid, stake handling depends on bet kind
    this.bankroll += profit;
    this.action += bet.amount;
    this.theoretical += bet.amount * edgeFor(bet, this);
    this._log((note||'')+' +'+profit);
    if(this.bankroll > this.peak) this.peak = this.bankroll;
  }
  _lose(bet, note){
    // stake already debited at placement
    this.action += bet.amount;
    this.theoretical += bet.amount * edgeFor(bet, this);
    this._log((note||'')+' -'+bet.amount);
    this._drop(bet.id);
    if(this.bankroll < this.trough) this.trough = this.bankroll;
  }
  _drop(id){ const i=this.bets.findIndex(b=>b.id===id); if(i>=0) this.bets.splice(i,1); }
  _winEven(bet, note){ this._pay(bet, bet.amount, note||('WIN '+bet.type)); this.bankroll += bet.amount; this._drop(bet.id); }
  // note: _pay adds profit; stake return added separately where the bet resolves (not stays up)

  _resolveLineBet(bet, total){
    // pass/come-number/dont variants during point phase
    const isDark = (bet.type==='dontpass'||bet.type==='dontcome');
    const num = bet.number || this.point;
    const label = bet.type+' '+bet.amount+(num?' on '+num:'');
    if(total===7){
      if(isDark){ this._winEven(bet,'WIN '+label); }
      else { this._lose(bet,'LOSE '+label+' (7-out)'); this._dropOddsOf(bet.id); }
      return 'seven';
    }
    if(total===num){
      if(isDark){ this._lose(bet,'LOSE '+label+' (point made)'); this._dropOddsOf(bet.id); }
      else {
        this._winEven(bet,'WIN '+label);
        // pay odds at true odds
        this.getBets('odds').filter(o=>o.parentId===bet.id).forEach(o=>{
          const [p,q] = TRUE_ODDS[num];
          const profit = o.amount*p/q;
          this._pay(o, profit, 'WIN odds '+o.amount+' on '+num);
          this.bankroll += o.amount; this._drop(o.id);
        });
      }
      return 'made';
    }
    return null;
  }
  _dropOddsOf(parentId){
    this.getBets('odds').filter(o=>o.parentId===parentId).forEach(o=>this._drop(o.id));
  }

  roll(){
    const {d1,d2,total} = rollDice(this.rng);
    this.rolls++;
    const ev = [];
    const T = total;
    ev.push({t:'roll', d1, d2, total:T, phase:this.phase, point:this.point});

    /* ---- one-roll props & field resolve every roll ---- */
    const props = this.bets.filter(b=>['anyseven','anycraps','ce','horn','hop','field'].includes(b.type));
    props.forEach(b=>{
      if(b.type==='anyseven'){
        if(T===7){ this._pay(b, b.amount*4, 'WIN any seven 4:1'); this.bankroll+=b.amount; this._drop(b.id); }
        else this._lose(b,'LOSE any seven');
      } else if(b.type==='anycraps'){
        if(T===2||T===3||T===12){ this._pay(b, b.amount*7, 'WIN any craps 7:1'); this.bankroll+=b.amount; this._drop(b.id); }
        else this._lose(b,'LOSE any craps');
      } else if(b.type==='ce'){
        const half=b.amount/2;
        if(T===2||T===3||T===12){ this._pay(b, half*7, 'WIN C&E craps part'); this.bankroll+=half; this._drop(b.id); }
        else if(T===11){ this._pay(b, half*15, 'WIN C&E eleven'); this.bankroll+=half; this._drop(b.id); }
        else this._lose(b,'LOSE C&E');
      } else if(b.type==='horn'){
        const u=b.amount/4;
        if(T===2||T===12){ this._pay(b, u*30, 'WIN horn on '+(T)); this.bankroll+=u; this._drop(b.id); }
        else if(T===3||T===11){ this._pay(b, u*15, 'WIN horn on '+T); this.bankroll+=u; this._drop(b.id); }
        else this._lose(b,'LOSE horn');
      } else if(b.type==='hop'){
        const {d1:hd1,d2:hd2,hard} = b.meta;
        const hit = hard ? (d1===hd1&&d2===hd2) : ((d1===hd1&&d2===hd2)||(d1===hd2&&d2===hd1));
        if(hit){
          const mult = hard?30:15;
          this._pay(b, b.amount*mult, 'WIN hop '+mult+':1');
          this.bankroll += b.amount; this._drop(b.id);
        }
        else this._lose(b,'LOSE hop');
      } else if(b.type==='field'){
        const winNums=[2,3,4,9,10,11,12];
        if(winNums.includes(T)){
          let mult=1;
          if(this.fieldPay==='2x' && (T===2||T===12)) mult=2;
          // 3x table: the triple number pays 3:1, the OTHER of 2/12 still pays 2:1
          if(this.fieldPay==='3x'){ if(T===this.fieldTriple) mult=3; else if(T===2||T===12) mult=2; }
          const profit = b.amount*mult;
          this._pay(b, profit, 'WIN field x'+mult);
          this.bankroll += b.amount; this._drop(b.id);
        } else this._lose(b,'LOSE field');
      }
    });

    /* ---- come-out phase ---- */
    if(this.phase==='comeout'){
      // ATS/fire/repeater: 7 on come-out doesn't end hand; track numbers
      this._trackBonus(T, false);
      if(T===7){
        this.getBets('pass').forEach(b=>this._winEven(b,'WIN pass (natural 7)'));
        this.getBets('dontpass').forEach(b=>this._lose(b,'LOSE don\'t pass (natural 7)'));
        this.decisions++;
        // new shooter? No — shooter continues on come-out win. Keep same shooter.
      } else if(T===11){
        if(this.crapless){
          this._setPoint(T, ev);
        } else {
          this.getBets('pass').forEach(b=>this._winEven(b,'WIN pass (natural 11)'));
          this.getBets('dontpass').forEach(b=>this._lose(b,'LOSE don\'t pass (11)'));
          this.decisions++;
        }
      } else if(T===2||T===3||T===12){
        if(this.crapless){
          this._setPoint(T, ev);
        } else {
          this.getBets('pass').forEach(b=>{this._lose(b,'LOSE pass (craps '+T+')');});
          this.getBets('dontpass').forEach(b=>{
            if(T===12){ this.bankroll+=b.amount; this._drop(b.id); this._log('PUSH don\'t pass (12)'); }
            else this._winEven(b,'WIN don\'t pass (craps '+T+')');
          });
          this.decisions++;
        }
      } else {
        this._setPoint(T, ev);
      }
    }
    /* ---- point phase ---- */
    else {
      const P = this.point;
      this._trackBonus(T, true);
      if(T===7){
        ev.push({t:'sevenout', point:P});
        // FIX (Oct 2026): a come bet's first roll is its own come-out — a 7
        // there is a natural WIN for the come (and a loss for don't come),
        // not a 7-out loss. Resolve traveling bets first; the loops below
        // then only touch established bets (resolved ones are already dropped).
        this.getBets('come').filter(b=>b.meta.traveling).forEach(b=>this._winEven(b,'WIN come (natural 7)'));
        this.getBets('dontcome').filter(b=>b.meta.traveling).forEach(b=>this._lose(b,"LOSE don't come (natural 7)"));
        // line bets
        this.getBets('pass').forEach(b=>{this._lose(b,'LOSE pass (7-out)'); this._dropOddsOf(b.id);});
        this.getBets('dontpass').forEach(b=>this._winEven(b,'WIN don\'t pass (7-out)'));
        // come / don't come bets (traveled or traveling): lose/win on 7
        this.getBets('come').forEach(b=>{this._lose(b,'LOSE come (7-out)'); this._dropOddsOf(b.id);});
        this.getBets('dontcome').forEach(b=>this._winEven(b,'WIN don\'t come (7-out)'));
        // lay odds behind don't bets win at inverse true odds
        this.getBets('odds').filter(o=>o.meta.lay).forEach(o=>{
          const [p,q]=TRUE_ODDS[o.number];
          const profit = o.amount*q/p;
          this._pay(o, profit, 'WIN lay odds '+o.amount+' on '+o.number);
          this.bankroll += o.amount; this._drop(o.id);
        });
        // place/buy/hardway: working lose, off returned
        ['place','buy','hardway','big68'].forEach(ty=>{
          this.getBets(ty).forEach(b=>{
            if(b.working){ this._lose(b,'LOSE '+ty+' '+b.number+' (7-out)'); }
            else { this.bankroll+=b.amount; this._drop(b.id); this._log('RETURN '+ty+' (off)'); }
          });
        });
        // lay wins (always working)
        this.getBets('lay').forEach(b=>{
          const [p,q]=LAY_PAYS[b.number];
          let profit = b.amount*p/q;
          const vig = Math.ceil(profit*0.05);
          profit -= vig;
          this._pay(b, profit, 'WIN lay '+b.number);
          this.bankroll += b.amount; this._drop(b.id);
        });
        // odds on losers are dead
        this.bets.filter(b=>b.type==='odds').forEach(o=>this._drop(o.id));
        // bonus bets lose at seven-out
        this.getBets('ats').forEach(b=>this._lose(b,'LOSE ATS (7-out)'));
        this.getBets('fire').forEach(b=>{
          const n = this.firePoints ? this.firePoints.size : 0;
          const pay = this.firePay[n]||0;
          if(pay>0){ const profit=b.amount*pay; this._pay(b,profit,'WIN fire ('+n+' points)'); this.bankroll+=b.amount; }
          else this._lose(b,'LOSE fire ('+n+' points)');
          this._drop(b.id);
        });
        this.getBets('repeater').forEach(b=>this._lose(b,'LOSE repeater (7-out)'));
        this.decisions++;
        // reset for new shooter
        this.phase='comeout'; this.point=null; this.shooters++;
        this.atsSets=null; this.firePoints=null; this.repeaterCount=0;
        this.getBets('hardway').forEach(b=>{ b.working=false; });
        ev.push({t:'newshooter'});
      }
      else {
        // come bets traveling: this roll is their come-out
        this.getBets('come').filter(b=>b.meta.traveling).forEach(b=>{
          if(T===7||T===11){ this._winEven(b,'WIN come (natural)'); }
          else if(T===2||T===3||T===12){ this._lose(b,'LOSE come (craps)'); }
          else { b.number=T; b.meta.traveling=false; b.meta.justTraveled=true; this._log('Come travels to '+T); }
        });
        this.getBets('dontcome').filter(b=>b.meta.traveling).forEach(b=>{
          if(T===7||T===11){ this._lose(b,'LOSE don\'t come (natural)'); }
          else if(T===2||T===3){ this._winEven(b,'WIN don\'t come (craps)'); }
          else if(T===12){ this.bankroll+=b.amount; this._drop(b.id); }
          else { b.number=T; b.meta.traveling=false; b.meta.justTraveled=true; this._log("Don't come travels to "+T); }
        });
        // line resolution vs point (skip bets that just traveled this roll)
        let made=false;
        this.getBets('pass').forEach(b=>{ const r=this._resolveLineBet(b,T); if(r==='made') made=true; });
        this.getBets('dontpass').forEach(b=>this._resolveLineBet(b,T));
        // come numbers resolve like line bets
        this.getBets('come').filter(b=>!b.meta.traveling && !b.meta.justTraveled).forEach(b=>{ this._resolveLineBet(b,T); });
        this.getBets('dontcome').filter(b=>!b.meta.traveling && !b.meta.justTraveled).forEach(b=>this._resolveLineBet(b,T));
        this.bets.forEach(b=>{ delete b.meta.justTraveled; });
        // place / buy / hardway / big68 wins
        const pays = this.crapless ? PLACE_PAYS_CRAPLESS : PLACE_PAYS_STD;
        this.getBets('place').forEach(b=>{
          if(!b.working) return;
          const pp = pays[b.number];
          if(pp && T===b.number){
            const [p,q]=pp;
            const profit = b.amount*p/q;
            this._pay(b, profit, 'WIN place '+b.number);
            // stays up
          }
        });
        this.getBets('buy').forEach(b=>{
          if(!b.working) return;
          if(T===b.number){
            const [p,q]=TRUE_ODDS[b.number];
            let profit = b.amount*p/q;
            if(this.buyVig==='onwin'){
              const vig = Math.max(1, Math.ceil(b.amount*0.05));
              profit -= vig;
            }
            this._pay(b, profit, 'WIN buy '+b.number);
          }
        });
        this.getBets('lay').forEach(b=>{
          if(T===b.number){ this._lose(b,'LOSE lay '+b.number+' (number hit)'); }
        });
        this.getBets('hardway').forEach(b=>{
          if(!b.working) return;
          const pair = (d1===d2);
          if(T===b.number && pair){
            const [p,q]=HARDWAY_PAYS[b.number];
            this._pay(b, b.amount*p/q, 'WIN hard '+b.number);
          } else if(T===7 || T===b.number){
            this._lose(b,'LOSE hard '+b.number);
          }
        });
        this.getBets('big68').forEach(b=>{
          if(T===b.number){ this._winEven(b,'WIN big '+b.number); }
          // 7 handled above; stays otherwise
        });
        // repeater: count point makes
        this.getBets('repeater').forEach(b=>{
          if(T===b.number && b.working!==false){
            b.meta.count++;
            const pay = this.repeaterCfg.pay[b.meta.count];
            if(pay){ const profit=b.amount*pay; this._pay(b,profit,'WIN repeater x'+b.meta.count); }
          }
        });
        if(made){
          this.phase='comeout'; this.point=null;
          this.getBets('hardway').forEach(b=>{ b.working=false; });
          ev.push({t:'pointmade'});
        }
      }
    }

    if(this.bankroll < this.trough) this.trough = this.bankroll;
    ev.push({t:'bankroll', bankroll: Math.round(this.bankroll*100)/100});
    return ev;
  }

  _setPoint(T, ev){
    this.phase='point'; this.point=T;
    ev.push({t:'point', point:T});
    this.getBets('hardway').forEach(b=>{ b.working=true; });
    this._log('Point is '+T);
  }
  _trackBonus(T, inPoint){
    // ATS: track small/tall numbers per shooter
    if(this.atsSets){
      if(T>=2&&T<=6) this.atsSets.small.add(T);
      if(T>=8&&T<=12) this.atsSets.tall.add(T);
      const s=this.atsSets.small.size>=5, t=this.atsSets.tall.size>=5;
      this.getBets('ats').forEach(b=>{
        const a=b.meta.amounts;
        if(s && !b.meta.paidS){ b.meta.paidS=true; const pr=(a.small||0)*this.atsPay.small; this._pay(b,pr,'WIN ATS Small'); }
        if(t && !b.meta.paidT){ b.meta.paidT=true; const pr=(a.tall||0)*this.atsPay.tall; this._pay(b,pr,'WIN ATS Tall'); }
        if(s&&t && !b.meta.paidA){ b.meta.paidA=true; const pr=(a.all||0)*this.atsPay.all; this._pay(b,pr,'WIN ATS All'); }
      });
    }
    // fire: distinct points made
    if(inPoint && this.firePoints && this.point && T===this.point){
      this.firePoints.add(T);
    }
  }
  snapshot(){
    return {phase:this.phase, point:this.point, bankroll:Math.round(this.bankroll*100)/100,
      bets:this.bets.map(b=>({id:b.id,type:b.type,amount:b.amount,number:b.number,working:b.working,parentId:b.parentId})),
      rolls:this.rolls, shooters:this.shooters};
  }
}

/* ---------------- sessions & batch ---------------- */
function runSession(engineOpts, strategy, sessOpts){
  sessOpts = sessOpts || {};
  const eng = new CrapsEngine(engineOpts);
  const mem = {};
  const maxRolls = sessOpts.maxRolls || 500;
  const maxShooters = sessOpts.maxShooters || 200;
  const winGoal = sessOpts.winGoal || 0;
  const stopLoss = sessOpts.stopLoss || 0;
  let rolls=0, ruin=false, hitGoal=false, stopped=null;
  while(rolls < maxRolls && eng.shooters <= maxShooters){
    try { strategy(eng, mem); } catch(e){ /* table/bankroll limits: stop betting */ }
    if(eng.bankroll < eng.tableMin && eng.bets.length===0){ ruin = eng.bankroll<=0; stopped='broke'; break; }
    eng.roll(); rolls++;
    const profit = eng.bankroll - eng.startBankroll;
    if(winGoal>0 && profit>=winGoal){ hitGoal=true; stopped='goal'; break; }
    if(stopLoss>0 && profit<=-stopLoss){ stopped='stop'; break; }
    if(eng.bankroll<=0){ ruin=true; stopped='ruin'; break; }
  }
  const profit = eng.bankroll - eng.startBankroll;
  return {profit: Math.round(profit*100)/100, rolls, shooters: eng.shooters,
    ruin, hitGoal, stopped, endBankroll: Math.round(eng.bankroll*100)/100,
    maxDrawdown: Math.round((eng.trough-eng.startBankroll)*100)/100,
    action: Math.round(eng.action*100)/100, theoretical: Math.round(eng.theoretical*100)/100,
    decisions: eng.decisions};
}
function percentile(sorted, p){
  if(!sorted.length) return 0;
  const i = (p/100)*(sorted.length-1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi]-sorted[lo])*(i-lo);
}
function runBatch(engineOpts, strategy, n, sessOpts, onProgress){
  const profits=[], rollsArr=[];
  let ruin=0, goal=0, win=0, totAction=0, totTheo=0, totRolls=0;
  for(let i=0;i<n;i++){
    const eo = Object.assign({}, engineOpts, {seed:(engineOpts.seed||1)+i*7919});
    const r = runSession(eo, strategy, sessOpts);
    profits.push(r.profit); rollsArr.push(r.rolls);
    if(r.profit>0) win++;
    if(r.ruin) ruin++;
    if(r.hitGoal) goal++;
    totAction+=r.action; totTheo+=r.theoretical; totRolls+=r.rolls;
    if(onProgress && i%Math.max(1,Math.floor(n/20))===0) onProgress(i/n);
  }
  profits.sort((a,b)=>a-b);
  const mean = profits.reduce((a,b)=>a+b,0)/n;
  return {
    n, winPct: win/n*100, ruinPct: ruin/n*100, goalPct: goal/n*100,
    mean: Math.round(mean*100)/100,
    median: Math.round(percentile(profits,50)*100)/100,
    best: Math.round(profits[n-1]*100)/100,
    worst: Math.round(profits[0]*100)/100,
    p5: Math.round(percentile(profits,5)*100)/100,
    p95: Math.round(percentile(profits,95)*100)/100,
    meanRolls: Math.round(totRolls/n),
    totalAction: Math.round(totAction*100)/100,
    theoreticalLoss: Math.round(totTheo*100)/100,
    edgeRealized: totAction>0 ? -(totTheo/totAction*100) : 0
  };
}

/* ---------------- strategy presets ----------------
// Each: function(eng, mem). Called before every roll. Idempotent.
*/
const STRATEGIES = {
flat10: {
  name:{en:'Flat $10 Pass', zh:'$10 過關線平注'},
  desc:{en:'$10 on the pass line every come-out. The baseline everything is measured against.', zh:'每次開骰 $10 過關線。所有策略的比較基準。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.hasBet('pass')) eng.placeBet('pass',{amount:10});
  }
},
molly: {
  name:{en:'Three Point Molly', zh:'三點 Molly'},
  desc:{en:'$10 pass + 3-4-5x odds, up to two $10 come bets with odds. The textbook low-edge grinder.', zh:'$10 過關線 + 3-4-5x 賠率，最多兩個 $10 來注加賠率。教科書級低優勢打法。'},
  fn(eng, mem){
    const U=10;
    if(eng.phase==='comeout'){
      if(!eng.hasBet('pass')) eng.placeBet('pass',{amount:U});
      return;
    }
    const line=eng.getBets('pass')[0];
    if(line && !eng.hasBet('odds', eng.point)){
      try{ eng.placeBet('odds',{amount:U*5, parentId:line.id}); }catch(e){
        try{ eng.placeBet('odds',{amount:U*4, parentId:line.id}); }catch(e2){}
      }
    }
    const comes=eng.getBets('come').filter(c=>!c.meta.traveling);
    if(comes.length<2 && !eng.getBets('come').some(c=>c.meta.traveling)){
      try{ eng.placeBet('come',{amount:U}); }catch(e){}
    }
    comes.forEach(c=>{
      if(!eng.hasBet('odds', c.number)){
        let amt=c.number===4||c.number===10?U*3:(c.number===5||c.number===9?U*4:U*5);
        try{ eng.placeBet('odds',{amount:amt, parentId:c.id}); }catch(e){}
      }
    });
  }
},
dolly: {
  name:{en:'Three Point Dolly (dark side)', zh:'三點 Dolly（反向）'},
  desc:{en:'The Molly\'s mirror image: $10 don\'t pass + $30 lay odds, up to two $10 don\'t come bets with lay odds. Same ~0.3% blended edge — you win when the table goes cold.', zh:'Molly 的鏡像：$10 不過關 + $30 放賠率，最多兩個 $10 不來注加放賠率。一樣約 0.3% 綜合優勢——桌冷你贏。'},
  fn(eng, mem){
    const U=10;
    if(eng.phase==='comeout'){
      if(!eng.hasBet('dontpass')) try{ eng.placeBet('dontpass',{amount:U}); }catch(e){}
      return;
    }
    const line=eng.getBets('dontpass')[0];
    if(line && !eng.hasBet('odds', eng.point)){
      try{ eng.placeBet('odds',{amount:30, parentId:line.id}); }catch(e){}
    }
    const dcs=eng.getBets('dontcome').filter(c=>!c.meta.traveling);
    if(dcs.length<2 && !eng.getBets('dontcome').some(c=>c.meta.traveling)){
      try{ eng.placeBet('dontcome',{amount:U}); }catch(e){}
    }
    dcs.forEach(c=>{
      if(!eng.hasBet('odds', c.number)){
        try{ eng.placeBet('odds',{amount:30, parentId:c.id}); }catch(e){}
      }
    });
  }
},
ironcross: {
  name:{en:'Iron Cross', zh:'鐵十字'},
  desc:{en:'Place 5/6/8 + field after the come-out. Wins on every roll except 7 — which wipes the whole layout 16.7% of the time.', zh:'開骰後置注 5/6/8 + field。除了 7 每擲都贏——但 7 有 16.7% 機率一次清檯。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.getBets('place').length){ mem.set=false; mem.reg=false; mem.done=false; mem.taken=0; }
    if(eng.phase!=='point') return;
    try{
      if(!eng.hasBet('place',5)) eng.placeBet('place',{amount:10, number:5});
      if(!eng.hasBet('place',6)) eng.placeBet('place',{amount:12, number:6});
      if(!eng.hasBet('place',8)) eng.placeBet('place',{amount:12, number:8});
      if(!eng.hasBet('field')) eng.placeBet('field',{amount:10});
    }catch(e){}
  }
},
martingale: {
  name:{en:'Martingale on Pass', zh:'過關線馬丁格爾'},
  desc:{en:'Double after every loss, back to $10 after a win. Same 1.41% edge — redistributed into small wins and rare disasters.', zh:'輸就加倍，贏就回到 $10。莊家優勢不變，只是把結果重分配成小贏加大災難。'},
  fn(eng, mem){
    if(mem.streak===undefined) mem.streak=0;
    if(eng.phase==='comeout' && !eng.hasBet('pass')){
      if(mem.inPlay){
        // previous pass decision resolved: bankroll above placement snapshot = win
        if(eng.bankroll > mem.snap) mem.streak=0; else mem.streak++;
        mem.inPlay=false;
      }
      const amt = Math.min(10*Math.pow(2,mem.streak), eng.tableMax, Math.floor(eng.bankroll));
      if(amt>=eng.tableMin){ try{ eng.placeBet('pass',{amount:amt}); mem.inPlay=true; mem.snap=eng.bankroll; }catch(e){} }
    }
  },
  onDecision:null // handled via bankroll delta tracking in UI; batch uses streak via mem
},
arnold: {
  name:{en:'The Arnold (hedge)', zh:'阿諾對沖'},
  desc:{en:'1u pass, then 4u don\'t come after the point, plus 1u come bets. Looks clever — hedging just multiplies edge exposure.', zh:'1 單位過關線，點數成立後 4 單位不來注，再加 1 單位來注。看似聰明——對沖只是放大莊家優勢的曝險。'},
  fn(eng, mem){
    const U=10;
    if(eng.phase==='comeout'){ if(!eng.hasBet('pass')) eng.placeBet('pass',{amount:U}); return; }
    if(!mem.dcPlaced){
      try{ eng.placeBet('dontcome',{amount:4*U}); mem.dcPlaced=true; }catch(e){}
    }
    if(!eng.getBets('come').some(c=>c.meta.traveling)){
      try{ eng.placeBet('come',{amount:U}); }catch(e){}
    }
    // replace don't come if it fell
    if(mem.dcPlaced && !eng.hasBet('dontcome')) mem.dcPlaced=false;
  }
},
cover4press: {
  name:{en:'Cover 4 — press', zh:'覆蓋 4 號—加注版'},
  desc:{en:'Place 5/6/8/9; every hit presses the winning number up one unit. More variance, same edge.', zh:'置注 5/6/8/9；每次中獎把該號碼加注一單位。波動更大，優勢不變。'},
  fn: cover4fn('press')
},
cover4collect: {
  name:{en:'Cover 4 — collect', zh:'覆蓋 4 號—收注版'},
  desc:{en:'Place 5/6/8/9; pocket every win. The calm version.', zh:'置注 5/6/8/9；每次中獎都收進口袋。冷靜版。'},
  fn: cover4fn('collect')
},
oneThreeTwoFive: {
  name:{en:'1-3-2-5 progression', zh:'1-3-2-5 纜法'},
  desc:{en:'Positive progression on the pass line: 1, 3, 2, 5 units. Reset on any loss or after completing the sequence.', zh:'過關線正向纜：1、3、2、5 單位。輸一次或走完就重設。'},
  fn(eng, mem){
    const seq=[1,3,2,5], U=10;
    if(mem.i===undefined) mem.i=0;
    if(eng.phase==='comeout' && !eng.hasBet('pass')){
      if(mem.inPlay){
        if(eng.bankroll > mem.snap) mem.i=(mem.i+1)%4; else mem.i=0;
        mem.inPlay=false;
      }
      const amt=U*seq[mem.i];
      if(amt<=eng.bankroll && amt>=eng.tableMin){ try{ eng.placeBet('pass',{amount:amt}); mem.inPlay=true; mem.snap=eng.bankroll; }catch(e){} }
    }
  }
},
dpLayHedge: {
  name:{en:"Don't Pass + Lay Hedge", zh:'不過關＋放注對沖'},
  desc:{en:'$30 don\'t pass; after the point, $15 place on 4 and 10, plus a $30 lay vs inside points. A 4/10 hit banks $27 and freerolls the rest — but a repeated point is -$60.', zh:'$30 不過關；點數成立後 $15 置注 4 和 10，內圍點數再加 $30 放注。4/10 一中就收 $27 進入 freeroll——但點數重現就是 -$60。'},
  fn(eng, mem){
    if(eng.phase==='comeout'){
      mem.stage=0;
      if(!eng.hasBet('dontpass')) try{ eng.placeBet('dontpass',{amount:30}); }catch(e){}
      return;
    }
    if(mem.stage===0){
      try{
        eng.placeBet('place',{amount:15, number:4});
        eng.placeBet('place',{amount:15, number:10});
        if([5,6,8,9].includes(eng.point)) eng.placeBet('lay',{amount:30, number:eng.point});
        mem.stage=1; mem.preHit=eng.bankroll; mem.freerolled=false;
      }catch(e){}
    } else if(mem.stage===1 && !mem.freerolled && eng.bankroll > mem.preHit + 20){
      // 4 or 10 hit ($27 win): bank the win, take down places AND remove the lay -> freeroll
      [4,10].forEach(n=>eng.getBets('place',n).forEach(b=>eng.removeBet(b.id)));
      eng.getBets('lay').forEach(b=>eng.removeBet(b.id));
      mem.freerolled=true;
    }
  }
},
inside110: {
  name:{en:'$110 Inside one-hit regression', zh:'$110 內圍一擊回歸'},
  desc:{en:'$25/$25/$30/$30 on 5/9/6/8. First hit pays $35 → regress to $22 across, +$13 locked, freeroll the rest.', zh:'5/9 各 $25、6/8 各 $30。第一擊付 $35 → 回歸到 $22，鎖定 +$13，之後 freeroll。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.getBets('place').length){ mem.set=false; mem.reg=false; mem.done=false; mem.taken=0; }
    if(eng.phase!=='point') return;
    if(!mem.set){
      try{
        eng.placeBet('place',{amount:25,number:5}); eng.placeBet('place',{amount:25,number:9});
        eng.placeBet('place',{amount:30,number:6}); eng.placeBet('place',{amount:30,number:8});
        mem.set=true; mem.orig=eng.bankroll;
      }catch(e){ return; }
    } else if(!mem.reg && eng.bankroll > mem.orig + 30){
      // a hit landed (bankroll jumped): regress
      [5,9,6,8].forEach(n=>eng.getBets('place',n).forEach(b=>eng.removeBet(b.id)));
      eng.placeBet('place',{amount:5,number:5}); eng.placeBet('place',{amount:5,number:9});
      eng.placeBet('place',{amount:6,number:6}); eng.placeBet('place',{amount:6,number:8});
      mem.reg=true;
    }
  }
},
reg68_24: {
  name:{en:'$24 6/8 one-hit regression', zh:'$24 6/8 一擊回歸'},
  desc:{en:'$12 on 6 and 8. First hit pays $14 → drop both to $6. +$2 locked on a $24 risk.', zh:'6 和 8 各 $12。第一擊付 $14 → 降到各 $6。$24 風險鎖定 +$2。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.getBets('place').length){ mem.set=false; mem.reg=false; mem.done=false; mem.taken=0; }
    if(eng.phase!=='point') return;
    if(!mem.set){
      try{ eng.placeBet('place',{amount:12,number:6}); eng.placeBet('place',{amount:12,number:8}); mem.set=true; mem.orig=eng.bankroll; }
      catch(e){ return; }
    } else if(!mem.reg && eng.bankroll > mem.orig + 10){
      [6,8].forEach(n=>eng.getBets('place',n).forEach(b=>eng.removeBet(b.id)));
      eng.placeBet('place',{amount:6,number:6}); eng.placeBet('place',{amount:6,number:8});
      mem.reg=true;
    }
  }
},
inside22: {
  name:{en:'$22 Inside two-hit takedown', zh:'$22 內圍兩擊收工'},
  desc:{en:'$5/$5/$6/$6 inside. Take down the first two hits, no press — about +$4 with $10 still working.', zh:'內圍 $5/$5/$6/$6。前兩擊直接收下不加注——約 +$4，檯上還留 $10。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.getBets('place').length){ mem.set=false; mem.reg=false; mem.done=false; mem.taken=0; }
    if(eng.phase!=='point') return;
    if(!mem.set){
      try{
        eng.placeBet('place',{amount:5,number:5}); eng.placeBet('place',{amount:5,number:9});
        eng.placeBet('place',{amount:6,number:6}); eng.placeBet('place',{amount:6,number:8});
        mem.set=true; mem.taken=0;
      }catch(e){ return; }
    } else if(mem.taken<2){
      // detect a hit by shrinking bet count? simpler: after any place win, take down one bet
      // we approximate: if bankroll rose since last check and bets remain, take down one
      if(mem.lastBr!==undefined && eng.bankroll > mem.lastBr){
        const b = eng.getBets('place')[0];
        if(b){ eng.removeBet(b.id); mem.taken++; }
      }
    }
    mem.lastBr = eng.bankroll;
  }
},
reno12: {
  name:{en:'$12 6/8 one-hit take-down', zh:'$12 6/8 一擊全收'},
  desc:{en:'$6 on 6 and 8. First hit → take both down, wait for the roll to end. Simplest one-hit system.', zh:'6 和 8 各 $6。第一擊 → 全部收下，等這輪結束。最簡單的一擊系統。'},
  fn(eng, mem){
    if(eng.phase==='comeout' && !eng.getBets('place').length){ mem.set=false; mem.reg=false; mem.done=false; mem.taken=0; }
    if(eng.phase!=='point') return;
    if(!mem.set){
      try{ eng.placeBet('place',{amount:6,number:6}); eng.placeBet('place',{amount:6,number:8}); mem.set=true; mem.orig=eng.bankroll; }
      catch(e){ return; }
    } else if(!mem.done && eng.bankroll > mem.orig + 5){
      eng.takeDownAll(); mem.done=true;
    }
  }
}
};

function cover4fn(mode){
  return function(eng, mem){
    if(eng.phase==='comeout'){ if(!eng.getBets('place').length) mem.set=false; return; }
    if(eng.phase!=='point') return;
    if(!mem.set){
      try{
        eng.placeBet('place',{amount:10,number:5}); eng.placeBet('place',{amount:10,number:9});
        eng.placeBet('place',{amount:12,number:6}); eng.placeBet('place',{amount:12,number:8});
        mem.set=true;
      }catch(e){ return; }
    }
    if(mode==='press' && mem.lastBr!==undefined && eng.bankroll > mem.lastBr+5){
      // a hit landed: press one winning number up a unit — approximate by pressing lowest
      const cands = eng.getBets('place').sort((a,b)=>a.amount-b.amount);
      if(cands.length){
        const b=cands[0];
        const unit = (b.number===6||b.number===8)?6:5;
        try{
          eng.removeBet(b.id);
          eng.placeBet('place',{amount:b.amount+unit, number:b.number});
        }catch(e){}
      }
    }
    mem.lastBr = eng.bankroll;
  };
}

// martingale streak tracking wrapper: strategies run per-roll; martingale needs
// loss/win detection per pass-line decision. We wrap runSession for it.
const _origRunSession = runSession;
function runSessionTracked(engineOpts, strategyId, sessOpts){
  const strat = STRATEGIES[strategyId];
  if(strategyId!=='martingale') return _origRunSession(engineOpts, strat.fn, sessOpts);
  // martingale: track pass-line decision outcomes
  const eng = new CrapsEngine(engineOpts);
  const mem = {streak:0};
  const sessOpts2 = sessOpts||{};
  const maxRolls = sessOpts2.maxRolls||500, maxShooters = sessOpts2.maxShooters||200;
  const winGoal = sessOpts2.winGoal||0, stopLoss = sessOpts2.stopLoss||0;
  let rolls=0, ruin=false, hitGoal=false, stopped=null, lastBr = eng.bankroll, pendingBet=0, inPlay=false;
  while(rolls<maxRolls && eng.shooters<=maxShooters){
    if(eng.phase==='comeout' && !eng.hasBet('pass') && !inPlay){
      const amt = Math.min(10*Math.pow(2,mem.streak), eng.tableMax);
      if(amt<=eng.bankroll && amt>=eng.tableMin){ eng.placeBet('pass',{amount:amt}); pendingBet=amt; inPlay=true; }
    }
    const d0 = eng.decisions;
    eng.roll(); rolls++;
    if(eng.decisions>d0 && inPlay){
      // a pass decision resolved
      const after = eng.bankroll;
      if(after > lastBr) mem.streak=0; else mem.streak++;
      inPlay=false; lastBr=after;
    } else { lastBr = eng.bankroll; }
    const profit = eng.bankroll - eng.startBankroll;
    if(winGoal>0 && profit>=winGoal){ hitGoal=true; stopped='goal'; break; }
    if(stopLoss>0 && profit<=-stopLoss){ stopped='stop'; break; }
    if(eng.bankroll<=0){ ruin=true; stopped='ruin'; break; }
    if(eng.bankroll < eng.tableMin && eng.bets.length===0 && !inPlay){ stopped='broke'; break; }
  }
  const profit = eng.bankroll - eng.startBankroll;
  return {profit:Math.round(profit*100)/100, rolls, shooters:eng.shooters, ruin, hitGoal, stopped,
    endBankroll:Math.round(eng.bankroll*100)/100,
    maxDrawdown:Math.round((eng.trough-eng.startBankroll)*100)/100,
    action:Math.round(eng.action*100)/100, theoretical:Math.round(eng.theoretical*100)/100, decisions:eng.decisions};
}
function runBatchTracked(engineOpts, strategyId, n, sessOpts, onProgress){
  const profits=[]; let ruin=0,goal=0,win=0,totAction=0,totTheo=0,totRolls=0;
  for(let i=0;i<n;i++){
    const eo = Object.assign({}, engineOpts, {seed:(engineOpts.seed||1)+i*7919});
    const r = runSessionTracked(eo, strategyId, sessOpts);
    profits.push(r.profit);
    if(r.profit>0) win++; if(r.ruin) ruin++; if(r.hitGoal) goal++;
    totAction+=r.action; totTheo+=r.theoretical; totRolls+=r.rolls;
    if(onProgress && i%Math.max(1,Math.floor(n/20))===0) onProgress(i/n);
  }
  profits.sort((a,b)=>a-b);
  const mean = profits.reduce((a,b)=>a+b,0)/n;
  return {n, winPct:win/n*100, ruinPct:ruin/n*100, goalPct:goal/n*100,
    mean:Math.round(mean*100)/100, median:Math.round(percentile(profits,50)*100)/100,
    best:Math.round(profits[n-1]*100)/100, worst:Math.round(profits[0]*100)/100,
    p5:Math.round(percentile(profits,5)*100)/100, p95:Math.round(percentile(profits,95)*100)/100,
    meanRolls:Math.round(totRolls/n), totalAction:Math.round(totAction*100)/100,
    theoreticalLoss:Math.round(totTheo*100)/100};
}

/* Dispatcher: pages may pass a strategy key ('molly'), a STRATEGIES entry
   ({name, desc, fn}), or a bare function. Normalizes to the right runner and
   RETURNS the session result — callers must use the return value. */
const _plainRunSession = runSession;
runSession = function(engineOpts, strategy, sessOpts){
  if(typeof strategy==='string') return runSessionTracked(engineOpts, strategy, sessOpts);
  const fn = typeof strategy==='function' ? strategy : (strategy && strategy.fn);
  if(typeof fn!=='function') throw new Error('runSession: strategy has no fn');
  const key = Object.keys(STRATEGIES).find(k=>STRATEGIES[k]===strategy || STRATEGIES[k].fn===fn);
  if(key==='martingale') return runSessionTracked(engineOpts, 'martingale', sessOpts);
  return _plainRunSession(engineOpts, fn, sessOpts);
};

if(typeof module!=='undefined' && module.exports){
  module.exports = {mulberry32, rollDice, CrapsEngine, runSession:runSessionTracked,
    runBatch:runBatchTracked, STRATEGIES, WAYS, TRUE_ODDS, EDGE};
}
