/* ===== App controller ===== */
const Modal = (() => {
  const bd = document.getElementById('modalBackdrop');
  const m = document.getElementById('modal');
  function open(html){ m.innerHTML = html; bd.classList.add('show');
    setTimeout(()=>{ const f=m.querySelector('input,textarea,select'); f&&f.focus(); },50); }
  function close(){ bd.classList.remove('show'); m.innerHTML=''; }
  bd.onclick = e => { if(e.target === bd) close(); };
  document.addEventListener('keydown', e => { if(e.key==='Escape' && bd.classList.contains('show')) close(); });
  return { open, close };
})();

const Toast = (() => {
  const t = document.getElementById('toast'); let timer;
  function show(msg){ t.textContent = msg; t.hidden = false;
    clearTimeout(timer); timer = setTimeout(()=> t.hidden = true, 2200); }
  return { show };
})();

const App = (() => {
  function switchTab(name){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id===`tab-${name}`));
    if(name==='dashboard') refreshKPIs();
    if(name==='expeditions') Expeditions.render();
    if(name==='notes') Notes.render();
    if(name==='summit') Summit.render();
  }

  function refreshKPIs(){
    const d = Store.data;
    set('kpiLinks', d.supplies.length);
    set('kpiActive', d.cards.filter(c=>c.status==='climbing' && !c.archived).length);
    set('kpiDone', d.cards.filter(c=>c.status==='summit' && !c.archived).length);
    const today = new Date(); today.setHours(0,0,0,0);
    set('kpiDue', d.cards.filter(c => c.due && c.status!=='summit' && !c.archived &&
      (new Date(c.due+'T00:00:00') - today)/864e5 <= 2).length);
    // route preview
    const route = d.cards.filter(c=>c.status!=='summit' && !c.archived)
      .sort((a,b)=>(a.due||'9999')<(b.due||'9999')?-1:1).slice(0,5);
    document.getElementById('dashRoute').innerHTML = route.length
      ? route.map(c=>`<li><span>${esc(c.title)}</span><span class="mini-tag">${c.due?fmt(c.due):c.label||''}</span></li>`).join('')
      : `<li class="empty">Nothing queued. Add cards in The Ascent.</li>`;
    // recent wins: summited in the last 7 days, not yet archived
    const winsEl = document.getElementById('dashWins');
    if(winsEl){
      const cutoff = Date.now() - 7*864e5;
      const wins = d.cards.filter(c => c.status==='summit' && !c.archived && c.summitedAt && c.summitedAt >= cutoff)
        .sort((a,b) => b.summitedAt - a.summitedAt).slice(0,6);
      winsEl.innerHTML = wins.length
        ? wins.map(c => `<li><span>${esc(c.title)}</span><span class="mini-tag">${c.client?'🏔 '+esc(c.client):fmtWinDate(c.summitedAt)}</span></li>`).join('')
        : `<li class="empty">No summits in the last 7 days.</li>`;
    }
    // supplies preview
    const sup = d.supplies.slice(0,5);
    document.getElementById('dashSupplies').innerHTML = sup.length
      ? sup.map(s=>`<li>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`:`<span>${esc(s.title)}</span>`}<span class="mini-tag">${esc(s.category||'')}</span></li>`).join('')
      : `<li class="empty">No supplies cached yet.</li>`;
    // today's climb
    const climb = document.getElementById('dashClimb');
    if(climb){ climb.innerHTML = Summit.dashboardWidget(); Summit.wireDashboard(); }
    // weather closing in: overdue + due within 7 days, not summited
    const todayK = new Date(); todayK.setHours(0,0,0,0);
    const due = d.cards.filter(c => c.due && c.status!=='summit' && !c.archived)
      .map(c => ({...c, days: Math.round((new Date(c.due+'T00:00:00') - todayK)/864e5)}))
      .filter(c => c.days <= 7)
      .sort((a,b) => a.days - b.days)
      .slice(0,6);
    const dueEl = document.getElementById('dashDue');
    if(dueEl){
      dueEl.innerHTML = due.length
        ? due.map(c => {
            const tag = c.days < 0 ? `<span class="mini-tag over">⚑ ${-c.days}d overdue</span>`
                      : c.days === 0 ? `<span class="mini-tag soon">today</span>`
                      : `<span class="mini-tag ${c.days<=2?'soon':''}">${fmt(c.due)}</span>`;
            return `<li><span>${esc(c.title)}</span>${tag}</li>`;
          }).join('')
        : `<li class="empty">Nothing due soon. Clear skies.</li>`;
    }
  }
  function fmt(d){ return new Date(d+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function fmtWinDate(ts){ return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function set(id,v){ document.getElementById(id).textContent = v; }

  function setStorageState(state, name){
    const dot = document.getElementById('storageDot');
    const lbl = document.getElementById('storageLabel');
    dot.className = 'dot ' + state;
    lbl.textContent = state==='synced' ? name : 'Local store';
  }

  function renderAll(){ Cache.render(); Ascent.render(); Notes.render(); Summit.render(); Expeditions.render(); refreshKPIs(); }

  function openNote(id){ switchTab('notes'); Notes.openById(id); }
  function openPalette(){ Palette.show(); }

  let nudgeDismissed = false;   // dismissed this session until next change
  function checkBackupNudge(){
    const el = document.getElementById('backupNudge');
    el.hidden = !(Store.backupDue() && !nudgeDismissed);
  }
  function onDataChanged(){ nudgeDismissed = false; checkBackupNudge(); }

  function init(){
    Store.load();
    Cache.init(); Ascent.init(); Notes.init(); Summit.init(); Palette.init(); Expeditions.init();
    const ph = document.getElementById('paletteHint');
    if(ph) ph.onclick = () => Palette.show();

    document.querySelectorAll('.nav-item[data-tab]').forEach(b =>
      b.onclick = () => switchTab(b.dataset.tab));
    document.querySelectorAll('[data-jump]').forEach(b =>
      b.onclick = () => switchTab(b.dataset.jump));

    document.getElementById('exportBtn').onclick = Store.exportJSON;
    document.getElementById('snapshotBtn').onclick = Store.exportSnapshot;
    document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').onchange = e => {
      if(e.target.files[0]) Store.importJSON(e.target.files[0]); e.target.value=''; };

    document.getElementById('nudgeBackup').onclick = () => {
      Store.doBackup(); checkBackupNudge(); };
    document.getElementById('nudgeDismiss').onclick = () => {
      nudgeDismissed = true; checkBackupNudge(); };

    setStorageState('local');

    // theme toggle
    const themeBtn = document.getElementById('themeToggle');
    const syncThemeBtn = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.getElementById('themeIcon').textContent = dark ? '☀️' : '🌙';
      document.getElementById('themeLabel').textContent = dark ? 'Day camp' : 'Night camp';
    };
    syncThemeBtn();
    themeBtn.onclick = () => {
      const root = document.documentElement;
      const dark = root.getAttribute('data-theme') === 'dark';
      if(dark){ root.removeAttribute('data-theme'); localStorage.setItem('basecamp.theme','light'); }
      else { root.setAttribute('data-theme','dark'); localStorage.setItem('basecamp.theme','dark'); }
      syncThemeBtn();
    };

    // date + greeting
    const now = new Date();
    document.getElementById('todayDate').textContent =
      now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
    const h = now.getHours();
    document.getElementById('greeting').textContent =
      h<5?'Pre-dawn push':h<12?'Morning, clear skies':h<17?'Afternoon ascent':h<21?'Evening descent':'Night watch';

    renderAll();
    checkBackupNudge();
  }

  return { init, switchTab, refreshKPIs, setStorageState, renderAll, checkBackupNudge: onDataChanged, openNote, openPalette };
})();

document.addEventListener('DOMContentLoaded', App.init);
