/* Craps Lab — interactive table felt (table.js)
 * Original layout built from standard craps rules. Wires into craps-engine.js
 * via the existing placeBetUI()/renderAll() in simulator.html. No engine changes.
 */
Object.assign(I18N.en,{
  ct_chip:"Chip", ct_custom:"Custom",
  ct_lay:"LAY", ct_place:"PLACE", ct_buy:"BUY",
  ct_hardways:"HARDWAYS", ct_props:"HOPS & PROPS",
  ct_inside:"Inside", ct_outside:"Outside", ct_across:"Across",
  ct_repeat:"Repeat", ct_down:"Down", ct_undo:"Undo", ct_dist:"Roll distribution",
  ct_pass:"PASS LINE", ct_dontpass:"DON'T PASS BAR",
  ct_come:"COME", ct_dontcome:"DON'T COME BAR",
  ct_field:"FIELD", ct_field_sub:"2 · 3 · 4 · 9 · 10 · 11 · 12",
  ct_hard4:"HARD 4", ct_hard6:"HARD 6", ct_hard8:"HARD 8", ct_hard10:"HARD 10",
  ct_anyseven:"ANY 7", ct_anycraps:"ANY CRAPS", ct_horn:"HORN", ct_ce:"C & E", ct_hop:"HOP",
  ct_big6:"BIG 6", ct_big8:"BIG 8",
  ct_puck_on:"ON", ct_puck_off:"OFF",
  ct_rolls:"Roll history", ct_sevens:"Sevens", ct_made:"Points made",
  ct_missed:"Points missed", ct_longest:"Longest hand", ct_rolls_unit:"rolls",
  ct_sevenout:"seven-out", ct_pointmade:"point made",
});
Object.assign(I18N.zh,{
  ct_chip:"籌碼", ct_custom:"自訂",
  ct_lay:"反押", ct_place:"正押", ct_buy:"買入",
  ct_hardways:"硬點", ct_props:"跳注與中心注",
  ct_inside:"內圈", ct_outside:"外圈", ct_across:"全押",
  ct_repeat:"重複", ct_down:"收下", ct_undo:"復原", ct_dist:"點數分佈",
  ct_pass:"過關線", ct_dontpass:"不過關",
  ct_come:"來注", ct_dontcome:"不來注",
  ct_field:"場注", ct_field_sub:"2 · 3 · 4 · 9 · 10 · 11 · 12",
  ct_hard4:"硬 4", ct_hard6:"硬 6", ct_hard8:"硬 8", ct_hard10:"硬 10",
  ct_anyseven:"任意 7", ct_anycraps:"任意 Craps", ct_horn:"號角", ct_ce:"C & E", ct_hop:"跳注",
  ct_big6:"大 6", ct_big8:"大 8",
  ct_puck_on:"開", ct_puck_off:"關",
  ct_rolls:"擲骰歷史", ct_sevens:"七點", ct_made:"過關點數",
  ct_missed:"未過點數", ct_longest:"最長手氣", ct_rolls_unit:"次",
  ct_sevenout:"七點出局", ct_pointmade:"點數過關",
});

/* ---------- table state ---------- */
let ctChip = 10;
let ctHistory = [];          // {d1,d2,total,outcome:'made'|'sevenout'|null}
let ctStats = null;
function ctResetStats(){
  ctStats = { sevens:0, made:0, missed:0, hand:0, longest:0 };
  ctHistory = [];
}
ctResetStats();

function ctPlaceNums(){
  return (typeof eng!=='undefined' && eng && eng.crapless)
    ? [2,3,4,5,6,8,9,10,11,12] : [4,5,6,8,9,10];
}

/* ---------- build the felt (single wide end, Crapsee-style) ---------- */
function buildTable(){
  const host = document.getElementById('crapstable');
  if(!host) return;
  const nums = ctPlaceNums();
  const hardDice = {4:[2,2],6:[3,3],8:[4,4],10:[5,5]};
  const hardPay = {4:'7 TO 1',6:'9 TO 1',8:'9 TO 1',10:'7 TO 1'};
  const numBoxes = nums.map(n=>`
    <div class="ct-numbox">
      <div class="ct-lay" data-bet="lay" data-number="${n}">${t('ct_lay')}</div>
      <div class="ct-zone ct-num" data-bet="place" data-number="${n}">
        <span class="ct-zlabel">${n===6?'Six':(n===9?'Nine':n)}</span>
        <span class="ct-puckslot" data-puckslot="${n}"></span>
        <span class="ct-chips" data-chips="place-${n}"></span>
      </div>
      <div class="ct-pb"><span data-bet="place" data-number="${n}">${t('ct_place')}</span><span data-bet="buy" data-number="${n}">${t('ct_buy')}</span></div>
    </div>`).join('');
  const hardBoxes = [4,6,8,10].map(n=>`
    <div class="ct-zone ct-hardbox" data-bet="hardway" data-number="${n}">
      <span class="ct-dicepair">${ctMiniDie(hardDice[n][0])}${ctMiniDie(hardDice[n][1])}</span>
      <span class="ct-hardlab">HARD ${n} · ${hardPay[n]}</span>
      <span class="ct-chips" data-chips="hardway-${n}"></span>
    </div>`).join('');
  const hopBoxes = [[1,1,'30 TO 1'],[6,6,'30 TO 1'],[1,2,'15 TO 1'],[5,6,'15 TO 1']].map(h=>`
    <div class="ct-zone ct-hopbox" data-bet="hop" data-d1="${h[0]}" data-d2="${h[1]}">
      <span class="ct-dicepair">${ctMiniDie(h[0])}${ctMiniDie(h[1])}</span>
      <span class="ct-hardlab">${h[2]}</span>
    </div>`).join('');

  host.innerHTML = `
  <div class="ct-wrap">
    <div class="ct-tablescroll">
    <div class="ct-felt ct-wide" id="ct-felt">
      <div class="ct-toprow">
        <div class="ct-place-row">${numBoxes}</div>
        <div class="ct-dccol">
          <div class="ct-puckbox"><span data-puckslot="off"></span></div>
          <div class="ct-zone ct-dontcome" data-bet="dontcome">
            <span class="ct-zlabel ct-vert">${t('ct_dontcome')}</span>
            <span class="ct-chips" data-chips="dontcome"></span>
          </div>
        </div>
      </div>
      <div class="ct-botrow">
        <div class="ct-panel">
          <div class="ct-paneltitle">${t('ct_hardways')}</div>
          <div class="ct-hardgrid">${hardBoxes}</div>
          <div class="ct-bigrow">
            <div class="ct-zone ct-big" data-bet="big68" data-number="6"><span class="ct-zlabel">${t('ct_big6')}</span><span class="ct-chips" data-chips="big68-6"></span></div>
            <div class="ct-zone ct-big" data-bet="big68" data-number="8"><span class="ct-zlabel">${t('ct_big8')}</span><span class="ct-chips" data-chips="big68-8"></span></div>
          </div>
        </div>
        <div class="ct-panel">
          <div class="ct-paneltitle">${t('ct_props')}</div>
          <div class="ct-zone ct-prop" data-bet="anyseven"><span class="ct-zlabel">${t('ct_anyseven')}</span><span class="ct-odds">4 TO 1</span><span class="ct-chips" data-chips="anyseven"></span></div>
          <div class="ct-hopgrid">${hopBoxes}</div>
          <div class="ct-propsrow2">
            <div class="ct-zone ct-prop" data-bet="anycraps"><span class="ct-zlabel">${t('ct_anycraps')}</span><span class="ct-odds">7 TO 1</span><span class="ct-chips" data-chips="anycraps"></span></div>
            <div class="ct-zone ct-prop" data-bet="horn"><span class="ct-zlabel">${t('ct_horn')}</span><span class="ct-odds">2·3·11·12</span><span class="ct-chips" data-chips="horn"></span></div>
            <div class="ct-zone ct-prop" data-bet="ce"><span class="ct-zlabel">${t('ct_ce')}</span><span class="ct-chips" data-chips="ce"></span></div>
          </div>
          <div class="ct-zone ct-prop ct-hopzone">
            <span class="ct-zlabel">${t('ct_hop')}</span>
            <span class="ct-hopctl">
              <select id="ct-hop-d1">${[1,2,3,4,5,6].map(v=>`<option>${v}</option>`).join('')}</select><select id="ct-hop-d2">${[1,2,3,4,5,6].map(v=>`<option>${v}</option>`).join('')}</select>
              <button class="ct-hopgo" data-bet="hop">✓</button>
            </span>
            <span class="ct-chips" data-chips="hop"></span>
          </div>
        </div>
        <div class="ct-bands">
          <div class="ct-zone ct-come" data-bet="come">
            <span class="ct-zlabel">${t('ct_come')}</span>
            <span class="ct-chips" data-chips="come"></span>
          </div>
          <div class="ct-zone ct-field" data-bet="field">
            <span class="ct-fieldnums"><span class="ct-fcirc">2</span><span>3</span><span>4</span><span>9</span><span>10</span><span>11</span><span class="ct-fcirc">12</span></span>
            <span class="ct-zlabel">${t('ct_field')}</span>
            <span class="ct-chips" data-chips="field"></span>
          </div>
          <div class="ct-zone ct-dontpass" data-bet="dontpass">
            <span class="ct-zlabel ct-red">${t('ct_dontpass')}</span>
            <span class="ct-chips" data-chips="dontpass"></span>
          </div>
          <div class="ct-zone ct-pass" data-bet="pass">
            <span class="ct-zlabel">${t('ct_pass')}</span>
            <span class="ct-chips" data-chips="pass"></span>
          </div>
        </div>
      </div>
    </div>
    </div>
    <div class="ct-rackbar">
      <span class="ct-chipbar-label">${t('ct_chip')}</span>
      ${[5,10,25,100,500].map(v=>`<button class="ct-chipbtn${v===ctChip?' active':''}" data-chip="${v}">$${v}</button>`).join('')}
      <input type="number" id="ct-custom" class="ct-custom" placeholder="${t('ct_custom')}" min="1">
      <span class="ct-racksep"></span>
      <button class="btn small" onclick="ctQuick('outside')">${t('ct_outside')}</button>
      <button class="btn small" onclick="ctQuick('inside')">${t('ct_inside')}</button>
      <button class="btn small" onclick="ctQuick('across')">${t('ct_across')}</button>
      <span class="ct-racksep"></span>
      <button class="btn small ghost" onclick="ctRepeat()">${t('ct_repeat')}</button>
      <button class="btn small ghost" onclick="clearBets()">${t('ct_down')}</button>
      <button class="btn small ghost" onclick="ctUndo()">${t('ct_undo')}</button>
    </div>
    <div class="ct-histwrap">
      <div class="ct-histhead">${t('ct_dist')}</div>
      <div class="ct-dist" id="ct-dist"></div>
      <div class="ct-histhead">${t('ct_rolls')}</div>
      <div class="ct-history" id="ct-history"></div>
      <div class="ct-handstats" id="ct-handstats"></div>
    </div>
  </div>`;

  // chip selector
  host.querySelectorAll('[data-chip]').forEach(b=>{
    b.addEventListener('click', ()=>{
      ctChip = +b.dataset.chip;
      document.getElementById('ct-custom').value='';
      host.querySelectorAll('[data-chip]').forEach(x=>x.classList.toggle('active', x===b));
    });
  });
  const custom = document.getElementById('ct-custom');
  custom.addEventListener('input', ()=>{
    const v = +custom.value;
    if(v>0){ ctChip = v; host.querySelectorAll('[data-chip]').forEach(x=>x.classList.remove('active')); }
  });

  // click-to-place (event delegation)
  document.getElementById('ct-felt').addEventListener('click', e=>{
    const z = e.target.closest('[data-bet]');
    if(!z || typeof eng==='undefined' || !eng) return;
    const type = z.dataset.bet;
    const params = { amount: ctChip };
    const n = z.dataset.number ? +z.dataset.number : null;
    if(n) params.number = n;
    if(type==='place' && (n===6||n===8)) params.amount = 6*Math.max(1, Math.round(ctChip/6));
    if(type==='horn') params.amount = 4*Math.max(1, Math.round(ctChip/4));
    if(type==='ce') params.amount = 2*Math.max(1, Math.round(ctChip/2));
    if(type==='hop'){
      let d1, d2;
      if(z.dataset.d1){ d1=+z.dataset.d1; d2=+z.dataset.d2; }
      else { d1=+document.getElementById('ct-hop-d1').value; d2=+document.getElementById('ct-hop-d2').value; }
      params.d1=d1; params.d2=d2; params.hard=(d1===d2);
    }
    placeBetUI(type, params);
  });

  renderTable();
  renderHistory();
}

/* ---------- map a bet to its felt zone ---------- */
function ctBetZone(b){
  switch(b.type){
    case 'pass': return 'pass';
    case 'dontpass': return 'dontpass';
    case 'come': return b.number ? 'place-'+b.number : 'come';
    case 'dontcome': return b.number ? 'place-'+b.number : 'dontcome';
    case 'place': case 'buy': case 'lay': return 'place-'+b.number;
    case 'hardway': return 'hardway-'+b.number;
    case 'field': return 'field';
    case 'anyseven': return 'anyseven';
    case 'anycraps': return 'anycraps';
    case 'horn': return 'horn';
    case 'ce': return 'ce';
    case 'hop': return 'hop';
    case 'big68': return 'big68-'+b.number;
    case 'odds': {
      if(typeof eng==='undefined'||!eng) return null;
      const p = eng.bets.find(x=>x.id===b.parentId);
      return p ? ctBetZone(p) : null;
    }
    default: return null; // ats, fire, repeater live off-felt
  }
}

/* ---------- render chips + puck ---------- */
function renderTable(){
  if(typeof eng==='undefined' || !eng) return;
  const host = document.getElementById('crapstable');
  if(!host || !host.querySelector('.ct-felt')) return;

  // rebuild place row if crapless toggled (check first wing only — both wings mirror it)
  const nums = ctPlaceNums();
  const firstRow = host.querySelector('.ct-place-row');
  const curBoxes = firstRow ? firstRow.querySelectorAll('.ct-num') : [];
  const curNums = [...curBoxes].map(x=>+x.dataset.number).join(',');
  if(curNums !== nums.join(',')){ buildTable(); return; }

  // clear chips
  host.querySelectorAll('[data-chips]').forEach(el=>{ el.innerHTML=''; });
  // clear puck
  host.querySelectorAll('[data-puckslot]').forEach(el=>{ el.innerHTML=''; });

  // group bets by zone
  const byZone = {};
  eng.bets.forEach(b=>{
    const z = ctBetZone(b);
    if(!z) return;
    (byZone[z] = byZone[z] || []).push(b);
  });
  Object.keys(byZone).forEach(z=>{
    const els = host.querySelectorAll(`[data-chips="${z}"]`);
    if(!els.length) return;
    const bets = byZone[z];
    const total = bets.reduce((s,b)=>s+b.amount, 0);
    const n = Math.min(3, bets.length);
    let chips='';
    for(let i=0;i<n;i++) chips+=`<span class="ct-chip c${i%4}"></span>`;
    els.forEach(el=>{
      el.innerHTML = chips + `<span class="ct-amt">$${total}</span>`;
      el.closest('.ct-zone').classList.add('has-bet');
    });
  });
  host.querySelectorAll('.ct-zone').forEach(z=>{
    const key = z.querySelector('[data-chips]');
    if(key && !byZone[key.dataset.chips]) z.classList.remove('has-bet');
  });

  // puck (shown on the point box at both ends of the table)
  host.querySelectorAll('.ct-zone.is-point').forEach(z=>z.classList.remove('is-point'));
  if(eng.phase==='point' && eng.point){
    host.querySelectorAll(`[data-puckslot="${eng.point}"]`).forEach(slot=>{
      slot.innerHTML = `<span class="ct-puck on">${t('ct_puck_on')}</span>`;
      slot.closest('.ct-zone').classList.add('is-point');
    });
  } else {
    const slot = host.querySelector('[data-puckslot="off"]');
    if(slot) slot.innerHTML = `<span class="ct-puck off">${t('ct_puck_off')}</span>`;
  }
}

/* ---------- roll history ---------- */
function ctRecordRoll(ev){
  const r = ev.find(e=>e.t==='roll');
  if(!r) return;
  let outcome = null;
  if(ev.find(e=>e.t==='sevenout')) outcome='sevenout';
  else if(ev.find(e=>e.t==='pointmade')) outcome='made';
  ctHistory.push({d1:r.d1, d2:r.d2, total:r.total, outcome});
  if(ctHistory.length>120) ctHistory.shift();
  // stats
  if(r.total===7) ctStats.sevens++;
  if(outcome==='made') ctStats.made++;
  if(outcome==='sevenout') ctStats.missed++;
  ctStats.hand++;
  if(ev.find(e=>e.t==='newshooter')){
    ctStats.longest = Math.max(ctStats.longest, ctStats.hand);
    ctStats.hand = 0;
  }
}

function renderHistory(){
  const h = document.getElementById('ct-history');
  if(!h) return;
  const items = ctHistory.slice(-50);
  h.innerHTML = items.map(r=>{
    const cls = r.outcome==='made' ? ' made' : (r.outcome==='sevenout' ? ' sevenout' : '');
    const title = r.outcome==='made' ? t('ct_pointmade') : (r.outcome==='sevenout' ? t('ct_sevenout') : '');
    return `<div class="ct-roll${cls}" title="${r.d1}-${r.d2} ${title}">
      <span class="ct-roll-dice">${ctMiniDie(r.d1)}${ctMiniDie(r.d2)}</span>
      <span class="ct-roll-total">${r.total}</span>
    </div>`;
  }).join('');
  h.scrollLeft = h.scrollWidth;

  const s = document.getElementById('ct-handstats');
  if(s && ctStats){
    s.innerHTML =
      `<span>🎲 ${t('ct_sevens')}: <b>${ctStats.sevens}</b></span>`+
      `<span class="pos">✅ ${t('ct_made')}: <b>${ctStats.made}</b></span>`+
      `<span class="neg">❌ ${t('ct_missed')}: <b>${ctStats.missed}</b></span>`+
      `<span>🔥 ${t('ct_longest')}: <b>${ctStats.longest}</b> ${t('ct_rolls_unit')}</span>`;
  }

  const d = document.getElementById('ct-dist');
  if(d){
    const counts = {}; for(let i=2;i<=12;i++) counts[i]=0;
    ctHistory.forEach(r=>{ counts[r.total]++; });
    const mx = Math.max(1, ...Object.values(counts));
    d.innerHTML = Object.keys(counts).map(k=>
      `<div class="ct-distcol"><div class="ct-distn">${counts[k]||''}</div><div class="ct-distbar" style="height:${Math.max(2, Math.round(counts[k]/mx*40))}px"></div><div class="ct-distl">${k}</div></div>`
    ).join('');
  }
}

function ctMiniDie(v){
  const p={1:[50,50],2:[30,30,70,70],3:[30,30,50,50,70,70],4:[32,32,68,32,32,68,68,68],5:[32,32,68,32,50,50,32,68,68,68],6:[32,28,68,28,32,50,68,50,32,72,68,72]}[v];
  let c=''; for(let i=0;i<p.length;i+=2) c+=`<circle cx="${p[i]}" cy="${p[i+1]}" r="10" fill="#1a1a1a"/>`;
  return `<svg viewBox="0 0 100 100" class="ct-minidie">${c}</svg>`;
}

/* ---------- quick bets / repeat / undo ---------- */
function ctQuick(kind){
  if(typeof eng==='undefined' || !eng) return;
  const all = eng.crapless ? [2,3,4,5,6,8,9,10,11,12] : [4,5,6,8,9,10];
  const set = kind==='inside' ? [5,6,8,9] : (kind==='outside' ? [4,5,9,10] : all);
  set.forEach(n=>{
    if(eng.bets.some(b=>(b.type==='place'||b.type==='buy') && b.number===n)) return;
    const amt = (n===6||n===8) ? 6*Math.max(1, Math.round(ctChip/6)) : ctChip;
    placeBetUI('place', {amount:amt, number:n});
  });
}
function ctUndo(){
  if(typeof eng==='undefined' || !eng || !eng.bets.length) return;
  eng.removeBet(eng.bets[eng.bets.length-1].id);
  renderAll();
}
function ctRepeat(){
  const snap = window._ctLastBets || [];
  snap.forEach(s=>{ placeBetUI(s.type, Object.assign({}, s.params)); });
}
