/* ===== Summit Log (habit / streak trackers) ===== */
const Summit = (() => {
  const COLORS = ['#3DA9C9','#3C8C6E','#E8A13A','#7C6FB0','#C9543B','#3E5572'];
  const HEATMAP_WEEKS = 16;
  let showArchived = false;

  // ---- local-date helpers (avoid UTC drift) ----
  function todayKey(){ return dateKey(new Date()); }
  function dateKey(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fromKey(k){ const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function startOfWeek(d){ const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-x.getDay()); return x; } // Sunday
  function isWeekend(d){ const g=d.getDay(); return g===0 || g===6; }
  function prevWorkday(d){ let x=addDays(d,-1); while(isWeekend(x)) x=addDays(x,-1); return x; }

  // ---- streak math ----
  function dailyStreak(log){
    // current streak counts back from today; today not-done does NOT break it (just not counted)
    let cur=0; let d=new Date(); d.setHours(0,0,0,0);
    if(!log[dateKey(d)]) d=addDays(d,-1);        // if today not done, start from yesterday
    while(log[dateKey(d)]){ cur++; d=addDays(d,-1); }
    return cur;
  }
  function weekdayStreak(log){
    // counts consecutive WORKDAYS (Mon–Fri); weekends are skipped, not counted as misses
    let cur=0; let d=new Date(); d.setHours(0,0,0,0);
    if(isWeekend(d)) d=prevWorkday(d);           // on a weekend, evaluate from last Friday
    else if(!log[dateKey(d)]) d=prevWorkday(d);  // today (a workday) not done → start from prior workday
    while(log[dateKey(d)]){ cur++; d=prevWorkday(d); }
    return cur;
  }
  function longestDailyStreak(log){
    const keys=Object.keys(log).filter(k=>log[k]).sort();
    let best=0,run=0,prev=null;
    keys.forEach(k=>{
      const d=fromKey(k);
      if(prev && (d-prev)===864e5) run++; else run=1;
      best=Math.max(best,run); prev=d;
    });
    return best;
  }
  function weekCount(log, weekStart){
    let n=0;
    for(let i=0;i<7;i++){ if(log[dateKey(addDays(weekStart,i))]) n++; }
    return n;
  }
  function weeklyStreak(log, target){
    // consecutive weeks (ending this week) where count >= target
    let cur=0; let ws=startOfWeek(new Date());
    // this week counts only if already met; otherwise start from last week
    if(weekCount(log,ws) < target) ws=addDays(ws,-7);
    while(weekCount(log,ws) >= target){ cur++; ws=addDays(ws,-7); }
    return cur;
  }

  function render(){
    const grid = document.getElementById('summitGrid');
    const all = Store.data.trackers||[];
    if(all.length === 0){
      grid.innerHTML = `<div class="summit-empty"><div class="big">⛰</div>
        <p>No routes yet. Add a daily or weekly habit to start logging your climb.</p></div>`;
      return;
    }
    const trackers = all.filter(t => showArchived ? t.archived : !t.archived);
    if(trackers.length === 0){
      grid.innerHTML = showArchived
        ? `<div class="summit-empty"><p>No archived routes.</p></div>`
        : `<div class="summit-empty"><p>All routes archived. Toggle "Archived" to view or restore them.</p></div>`;
      return;
    }
    grid.innerHTML = trackers.map(card).join('');
    wire(grid);
  }

  function card(t){
    const log = t.log||{};
    const tk = todayKey();
    const doneToday = !!log[tk];
    const cad = t.cadence;
    let streak, streakUnit, cadenceBadge;
    const thisWeek = weekCount(log, startOfWeek(new Date()));
    if(cad === 'weekly'){
      streak = weeklyStreak(log, t.weeklyTarget||1);
      streakUnit = streak===1?'week':'weeks';
      cadenceBadge = `<span class="trk-cadence weekly">${thisWeek}/${t.weeklyTarget} this week</span>`;
    } else if(cad === 'weekdays'){
      streak = weekdayStreak(log);
      streakUnit = streak===1?'workday':'workdays';
      cadenceBadge = `<span class="trk-cadence">Weekdays</span>`;
    } else {
      streak = dailyStreak(log);
      streakUnit = streak===1?'day':'days';
      cadenceBadge = `<span class="trk-cadence">Daily</span>`;
    }
    return `<div class="trk-card" data-id="${t.id}" style="--trk:${t.color}">
      <div class="trk-head">
        <div class="trk-title-wrap">
          <span class="trk-dot"></span>
          <span class="trk-name">${esc(t.name)}</span>
          ${cadenceBadge}
        </div>
        <div class="trk-menu">
          <button class="icon-btn" data-edit="${t.id}" title="Edit">✎</button>
          ${t.archived
            ? `<button class="icon-btn" data-restore="${t.id}" title="Restore">↩</button>`
            : `<button class="icon-btn" data-arch="${t.id}" title="Archive">📥</button>`}
        </div>
      </div>
      <div class="trk-stats">
        <div class="trk-streak"><span class="trk-streak-num">${streak}</span><span class="trk-streak-lbl">${streakUnit} on the mountain</span></div>
        <button class="trk-check ${doneToday?'done':''}" data-check="${t.id}">
          ${doneToday?'✓ Logged today':'Log today'}
        </button>
      </div>
      ${heatmap(log, t.color, cad)}
    </div>`;
  }

  function heatmap(log, color, cadence){
    const today = new Date(); today.setHours(0,0,0,0);
    const end = startOfWeek(today);                       // start of current week (Sun)
    const start = addDays(end, -7*(HEATMAP_WEEKS-1));     // first column
    const dimWeekends = cadence === 'weekdays';
    let cols = '';
    for(let w=0; w<HEATMAP_WEEKS; w++){
      let cells='';
      for(let day=0; day<7; day++){
        const d = addDays(start, w*7+day);
        const future = d > today;
        const on = log[dateKey(d)];
        let cls = future ? 'future' : (on ? 'on' : 'off');
        if(dimWeekends && isWeekend(d) && !on) cls += ' skip';   // weekends not required
        cells += `<span class="hm-cell ${cls}" title="${dateKey(d)}"></span>`;
      }
      cols += `<div class="hm-col">${cells}</div>`;
    }
    return `<div class="hm">${cols}</div>
      <div class="hm-legend"><span>${HEATMAP_WEEKS} weeks ago</span><span>today</span></div>`;
  }

  function wire(grid){
    grid.querySelectorAll('[data-check]').forEach(b =>
      b.onclick = () => toggleToday(b.dataset.check));
    grid.querySelectorAll('[data-edit]').forEach(b =>
      b.onclick = () => openForm(b.dataset.edit));
    grid.querySelectorAll('[data-arch]').forEach(b =>
      b.onclick = () => archive(b.dataset.arch));
    grid.querySelectorAll('[data-restore]').forEach(b =>
      b.onclick = () => restore(b.dataset.restore));
  }

  function restore(id){
    const t = Store.data.trackers.find(x=>x.id===id);
    if(t){ t.archived=false; Store.persist(); render(); App.refreshKPIs && App.refreshKPIs(); Toast.show('Route restored'); }
  }

  function toggleToday(id){
    const t = Store.data.trackers.find(x=>x.id===id);
    if(!t) return;
    t.log = t.log||{};
    const tk = todayKey();
    if(t.log[tk]) delete t.log[tk]; else t.log[tk]=true;
    Store.persist(); render();
    App.refreshKPIs && App.refreshKPIs();
  }

  function archive(id){
    const t = Store.data.trackers.find(x=>x.id===id);
    if(t){ t.archived=true; Store.persist(); render(); Toast.show('Route archived'); }
  }

  function openForm(id){
    const t = id ? Store.data.trackers.find(x=>x.id===id) : {cadence:'daily', weeklyTarget:3, color:COLORS[0]};
    Modal.open(`
      <h2>${id?'Edit route':'New route'}</h2>
      <div class="field"><label>Name</label>
        <input id="t-name" value="${esc(t.name||'')}" placeholder="Review inbox, Workout, No late meetings…"></div>
      <div class="field"><label>Cadence</label>
        <select id="t-cadence">
          <option value="daily" ${t.cadence==='daily'?'selected':''}>Daily — every day</option>
          <option value="weekdays" ${t.cadence==='weekdays'?'selected':''}>Weekdays — Mon–Fri (weekends skipped)</option>
          <option value="weekly" ${t.cadence==='weekly'?'selected':''}>Weekly — a target number of days</option>
        </select></div>
      <div class="field" id="t-weekrow" ${t.cadence==='weekly'?'':'style="display:none"'}>
        <label>Days per week target</label>
        <input type="number" id="t-target" min="1" max="7" value="${t.weeklyTarget||3}"></div>
      <div class="field"><label>Color</label>
        <div class="color-row" id="t-colors">
          ${COLORS.map(c=>`<button type="button" class="color-swatch ${(t.color||COLORS[0])===c?'sel':''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div></div>
      <div class="modal-actions">
        ${id?`<button class="btn-danger" id="t-del">Delete</button>`:''}
        <button class="btn-secondary" id="t-cancel">Cancel</button>
        <button class="btn-primary" id="t-save">${id?'Save':'Add route'}</button>
      </div>
    `);
    const $ = s => document.getElementById(s);
    let chosen = t.color || COLORS[0];
    $('t-cadence').onchange = e => { $('t-weekrow').style.display = e.target.value==='weekly'?'':'none'; };
    $('t-colors').querySelectorAll('[data-color]').forEach(sw =>
      sw.onclick = () => { chosen = sw.dataset.color;
        $('t-colors').querySelectorAll('.color-swatch').forEach(x=>x.classList.toggle('sel', x===sw)); });
    $('t-cancel').onclick = Modal.close;
    if(id) $('t-del').onclick = () => {
      if(confirm('Delete this route and its entire log? This cannot be undone.')){
        Store.data.trackers = Store.data.trackers.filter(x=>x.id!==id);
        Store.persist(); render(); Modal.close(); Toast.show('Route deleted');
      }
    };
    $('t-save').onclick = () => {
      const name = $('t-name').value.trim();
      if(!name){ Toast.show('Name is required'); return; }
      const cadence = $('t-cadence').value;
      const rec = {
        id: id || Store.uid(), name, cadence,
        weeklyTarget: cadence==='weekly' ? Math.min(7,Math.max(1, +$('t-target').value||3)) : null,
        color: chosen, archived:false,
        created: t.created || Date.now(),
        log: t.log || {}
      };
      if(id){ const i=Store.data.trackers.findIndex(x=>x.id===id); Store.data.trackers[i]=rec; }
      else (Store.data.trackers ||= []).push(rec);
      Store.persist(); render(); Modal.close();
      Toast.show(id?'Route updated':'Route added');
    };
  }

  // ---- dashboard widget ----
  function dashboardWidget(){
    const trackers = (Store.data.trackers||[]).filter(t=>!t.archived);
    if(trackers.length===0)
      return `<li class="empty">No routes yet. Add one in Summit Log.</li>`;
    const tk = todayKey();
    return trackers.map(t => {
      const done = !!(t.log||{})[tk];
      const cad = t.cadence;
      const streak = cad==='weekly' ? weeklyStreak(t.log||{}, t.weeklyTarget||1)
                   : cad==='weekdays' ? weekdayStreak(t.log||{})
                   : dailyStreak(t.log||{});
      return `<li class="climb-item">
        <button class="climb-check ${done?'done':''}" data-climb="${t.id}" title="${done?'Logged':'Log today'}">${done?'✓':''}</button>
        <span class="climb-name" style="--trk:${t.color}">${esc(t.name)}</span>
        <span class="mini-tag">${streak>0?('🔥 '+streak):'—'}</span>
      </li>`;
    }).join('');
  }
  function wireDashboard(){
    document.querySelectorAll('[data-climb]').forEach(b =>
      b.onclick = () => { toggleToday(b.dataset.climb); App.refreshKPIs && App.refreshKPIs(); });
  }

  function init(){
    document.getElementById('addTrackerBtn').onclick = () => openForm();
    const at = document.getElementById('summitArchToggle');
    at.onclick = () => {
      showArchived = !showArchived;
      at.textContent = showArchived ? 'Active' : 'Archived';
      at.classList.toggle('active', showArchived);
      render();
    };
  }

  return { render, init, dashboardWidget, wireDashboard, todayKey };
})();
