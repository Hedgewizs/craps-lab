/* Craps Lab i18n — full-site EN / 繁中 (Taiwan) toggle.
   Chrome strings (nav, buttons, labels) live here.
   Content strings (guides, glossary, quiz) live in content.js with {en,zh} fields.
   Usage: <span data-i18n="nav_home"></span> ; dynamic: t('key') */
const I18N = {
en:{
  nav_home:"Home", nav_guide:"Guide", nav_sim:"Simulator", nav_batch:"Batch Lab",
  nav_challenge:"Challenge", nav_practice:"Practice", nav_calc:"Calculators", nav_gear:"Gear", nav_about:"About",
  hero_tag:"The honest craps lab. Every bet. Real dice math. No real money.",
  hero_sub:"Learn the table, test strategies against 100,000 simulated sessions, and practice payouts — free, no signup.",
  cta_sim:"Open the simulator", cta_guide:"Read the guide",
  feat_sim_t:"Full-table simulator", feat_sim_d:"Every bet on a modern layout — line, odds, place, buy/lay, hardways, props, ATS, Fire — plus crapless tables. Working/off toggles included.",
  feat_batch_t:"Batch Lab", feat_batch_d:"Run 1,000, 10,000 or 100,000 scripted sessions. Win rate, percentiles, ruin probability, expected loss — the loss tail shown honestly.",
  feat_chal_t:"Challenge Mode", feat_chal_d:"30 rolls. Win big or bust. How far can your bankroll go?",
  feat_prac_t:"Practice trainer", feat_prac_d:"Payout quizzes with dealer mental-math shortcuts, a click-to-place layout trainer, and what-to-say-to-the-dealer scripts.",
  feat_gear_d:"Practice gear I actually recommend — precision dice, felt layouts, honest gambling-math books — plus Craps Lab merch.",
  roll:"Roll", clear_bets:"Clear bets", new_shooter:"New shooter",
  bankroll:"Bankroll", win_goal:"Win goal", stop_loss:"Stop loss", table_min:"Table min", table_max:"Table max",
  max_odds:"Max odds", field_pay:"Field pay", buy_vig:"Buy vig", crapless:"Crapless table",
  point:"Point", comeout:"Come-out", bankroll_now:"Bankroll",
  ad_label:"ADVERTISEMENT",
  house_ad_label:"Our sites",
  house_ad_text:"🚢 The Casino Cruiser — cruise free on casino comps",
  disclosure:"Craps Lab is a free educational simulator. No real money is wagered here. Every strategy on this site loses to the house edge in the long run — the math is shown honestly so you can see it for yourself.",
  footer_by:"Built for players who want the truth about the math.",
  start:"Start", stop:"Stop", reset:"Reset", run:"Run",
  sessions:"sessions", results:"Results",
},
zh:{
  nav_home:"首頁", nav_guide:"指南", nav_sim:"模擬器", nav_batch:"批量實驗室",
  nav_challenge:"挑戰模式", nav_practice:"練習", nav_calc:"計算機", nav_gear:"裝備", nav_about:"關於",
  hero_tag:"誠實的花旗骰實驗室。每種注。真實骰子數學。不賭真錢。",
  hero_sub:"學會看桌、用 100,000 次模擬 session 測試策略、練習賠付計算——免費，免註冊。",
  cta_sim:"開啟模擬器", cta_guide:"閱讀指南",
  feat_sim_t:"全桌模擬器", feat_sim_d:"現代賭桌上的每種注——過關線、賠率注、置注、買注/放注、硬式注、單擲注、ATS、Fire 注，外加無敗骰桌。含 working/off 開關。",
  feat_batch_t:"批量實驗室", feat_batch_d:"跑 1,000、10,000 或 100,000 次程式化 session。勝率、百分位、破產機率、期望損失——誠實呈現虧損尾部。",
  feat_chal_t:"挑戰模式", feat_chal_d:"30 次擲骰。要嘛大贏，要嘛歸零。你的賭本能走多遠？",
  feat_prac_t:"練習教練", feat_prac_d:"用荷官心算捷徑做賠付測驗、可點擊的下注版練習、以及跟荷官溝通的話術腳本。",
  feat_gear_d:"我真心推薦的練習裝備——精密骰子、桌布、誠實的賭博數學書——外加 Craps Lab 周邊。",
  roll:"擲骰", clear_bets:"清除注碼", new_shooter:"換擲骰者",
  bankroll:"賭本", win_goal:"停利目標", stop_loss:"停損", table_min:"桌檯下限", table_max:"桌檯上限",
  max_odds:"最大賠率", field_pay:"Field 賠付", buy_vig:"買注佣金", crapless:"無敗骰桌",
  point:"點數", comeout:"開骰", bankroll_now:"賭本",
  ad_label:"廣告",
  house_ad_label:"我們的網站",
  house_ad_text:"🚢 The Casino Cruiser —— 賭場回饋免費郵輪",
  disclosure:"Craps Lab 是免費教育模擬器，不涉及真錢投注。本站所有策略長期都輸給莊家優勢——數學誠實呈現，讓你自己看見。",
  footer_by:"為想看清數學真相的玩家而建。",
  start:"開始", stop:"停止", reset:"重設", run:"執行",
  sessions:"次模擬", results:"結果",
}};
let LANG = localStorage.getItem('crapslab_lang') || 'en';
function t(key){ return (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key; }
function setLang(l){
  LANG = (l==='zh') ? 'zh' : 'en';
  localStorage.setItem('crapslab_lang', LANG);
  document.documentElement.lang = LANG==='zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  const b = document.getElementById('langbtn'); if(b) b.textContent = LANG==='zh' ? 'EN' : '中';
  if (typeof onLangChange === 'function') onLangChange();
  if (typeof renderDynamic === 'function') renderDynamic();
}
function adSlot(){
  return `<div class="house-ad"><span class="house-ad-label" data-i18n="house_ad_label">${t('house_ad_label')}</span><a class="house-ad-link" href="https://hedgewizs.github.io/thecasinocruiser/" target="_blank" rel="noopener" data-i18n="house_ad_text">${t('house_ad_text')}</a></div>
  <!-- AdSense: paste responsive ad unit code inside .house-ad above; keep the label -->`;
}
function disclosure(){
  return `<div class="disclosure">⚠️ ${t('disclosure')}</div>`;
}
function navHTML(active){
  const L = [
    ['index.html','nav_home'],['guide.html','nav_guide'],['simulator.html','nav_sim'],
    ['batch.html','nav_batch'],['challenge.html','nav_challenge'],['practice.html','nav_practice'],
    ['calculators.html','nav_calc'],['gear.html','nav_gear'],['about.html','nav_about']
  ];
  return `<header class="site"><nav class="nav">
    <a class="brand" href="index.html">🎲 Craps Lab <small>dice math, honestly</small></a>
    ${L.map(([h,k])=>`<a class="nl${active===h?' active':''}" href="${h}" data-i18n="${k}">${t(k)}</a>`).join('')}
    <button class="langbtn" id="langbtn" onclick="setLang(LANG==='zh'?'en':'zh')">${LANG==='zh'?'EN':'中'}</button>
  </nav></header>`;
}
function footerHTML(){
  return `<footer class="site"><div class="wrap">
    <p data-i18n="footer_by">${t('footer_by')}</p>
    <p class="muted" style="font-size:.78rem">Craps Lab · ${t('disclosure')}</p>
  </div></footer>
  <script>setLang(LANG);<\/script>`;
}
