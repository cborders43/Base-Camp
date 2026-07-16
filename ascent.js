/* ===== The Ascent (Kanban) ===== */
const Ascent = (() => {
  const COLS = [
    {id:'todo',    title:'Base Camp',  dot:'#6B7E94', hint:'queued'},
    {id:'climbing',title:'Climbing',   dot:'#3DA9C9', hint:'in progress'},
    {id:'summit',  title:'Summited',   dot:'#3C8C6E', hint:'done'}
  ];
  const LABELS = {
    'Epic':'#3E5572','Review':'#3DA9C9','Admin':'#6B7E94',
    'Urgent':'#C9543B','Personal':'#E8A13A','':'#9aa7b5'
  };
  const PRIORITIES = {
    '':      {label:'— none —', color:'transparent', rank:0},
    'low':   {label:'Low',      color:'#9aa7b5',     rank:1},
    'medium':{label:'Medium',   color:'#3DA9C9',     rank:2},
    'high':  {label:'High',     color:'#E8A13A',     rank:3},
    'urgent':{label:'Urgent',   color:'#C9543B',     rank:4}
  };
  let dragId = null;
  let compact = false;

  function render(){
    const board = document.getElementById('board');
    board.classList.toggle('compact', compact);
    board.innerHTML = COLS.map(c => {
      const cards = Store.data.cards.filter(k => k.status === c.id && !k.archived)
        .sort((a,b) => {
          if(c.id === 'summit') return (b.summitedAt||0) - (a.summitedAt||0); // most recently summited first
          const pa = (PRIORITIES[a.priority||'']||{}).rank||0;
          const pb = (PRIORITIES[b.priority||'']||{}).rank||0;
          if(pb !== pa) return pb - pa;                 // higher priority first
          return (a.due||'9999') < (b.due||'9999') ? -1 : 1; // then soonest due
        });
      const archiveBtn = c.id === 'summit'
        ? `<button class="col-archive-btn" id="archiveSummitedBtn" title="Archive summited cards older than 7 days">📥 Archive old</button>`
        : '';
      return `<div class="col" data-col="${c.id}">
        <div class="col-head">
          <span class="col-dot" style="background:${c.dot}"></span>
          <span class="col-title">${c.title}</span>
          <span class="col-count">${cards.length}</span>
        </div>
        <div class="col-body" data-col="${c.id}">
          ${cards.map(kcard).join('')}
        </div>
        <button class="col-add" data-add="${c.id}">+ Add card</button>
        ${archiveBtn}
      </div>`;
    }).join('');
    wire();
  }

  function kcard(k){
    const lblColor = LABELS[k.label] ?? '#9aa7b5';
    const prio = PRIORITIES[k.priority||''] || PRIORITIES[''];
    const subs = (k.subtasks||[]);
    const doneCount = subs.filter(s=>s.done).length;
    const subsHtml = subs.length ? `<ul class="kcard-subs">${subs.map((s,i)=>
      `<li class="${s.done?'done':''}"><input type="checkbox" data-sub="${k.id}:${i}" ${s.done?'checked':''}><span>${esc(s.text)}</span></li>`
      ).join('')}</ul>` : '';
    const stripe = prio.rank>0 ? `style="border-left:3px solid ${prio.color}"` : '';
    const done = k.status === 'summit';
    if(done){
      // Summited cards get a compact, low-weight treatment — title + client + summited date only.
      return `<div class="kcard summited compact-summit" draggable="true" data-id="${k.id}">
        <span class="kcard-check">✓</span>
        <span class="kcard-title-compact">${esc(k.title)}</span>
        ${k.client ? `<span class="kcard-sub">🏔 ${esc(k.client)}</span>`:''}
        <span class="kcard-summited-date">${k.summitedAt ? fmtDue(new Date(k.summitedAt)) : ''}</span>
      </div>`;
    }
    return `<div class="kcard" draggable="true" data-id="${k.id}" ${stripe}>
      <div class="kcard-title">${esc(k.title)}</div>
      ${k.details ? `<div class="kcard-details">${esc(k.details)}</div>` : ''}
      ${subsHtml}
      <div class="kcard-meta">
        ${prio.rank>0 ? `<span class="kcard-prio" style="color:${prio.color}">▲ ${prio.label}</span>`:''}
        ${k.label ? `<span class="kcard-label" style="background:${lblColor}">${esc(k.label)}</span>`:''}
        ${k.client ? `<span class="kcard-sub">🏔 ${esc(k.client)}</span>`:''}
        ${subs.length ? `<span class="kcard-sub">☑ ${doneCount}/${subs.length}</span>`:''}
        ${(k.noteIds||[]).length ? `<span class="kcard-sub">📓 ${(k.noteIds||[]).length}</span>`:''}
        ${k.due ? dueBadge(k.due) : ''}
      </div>
    </div>`;
  }

  // Sets a card's status, stamping summitedAt when it enters Summited and
  // clearing it if it leaves (so re-summiting later gets a fresh timestamp).
  function setStatus(card, status){
    if(status === 'summit' && card.status !== 'summit') card.summitedAt = Date.now();
    else if(status !== 'summit') card.summitedAt = null;
    card.status = status;
  }

  function dueBadge(due){
    const d = new Date(due+'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((d - today)/864e5);
    let cls = '', txt = fmtDue(d);
    if(days < 0) cls = 'over';
    else if(days <= 2) cls = 'soon';
    return `<span class="kcard-due ${cls}">${days<0?'⚑ ':''}${txt}</span>`;
  }
  function fmtDue(d){ return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

  function wire(){
    const board = document.getElementById('board');
    board.querySelectorAll('.kcard').forEach(el => {
      el.onclick = () => openForm(el.dataset.id);
      el.ondragstart = e => { dragId = el.dataset.id; el.classList.add('dragging');
        e.dataTransfer.effectAllowed='move'; };
      el.ondragend = () => { el.classList.remove('dragging'); dragId=null;
        board.querySelectorAll('.col').forEach(c=>c.classList.remove('drop-target')); };
    });
    board.querySelectorAll('.col').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('drop-target'); };
      col.ondragleave = () => col.classList.remove('drop-target');
      col.ondrop = e => {
        e.preventDefault();
        const card = Store.data.cards.find(k => k.id === dragId);
        if(card){ setStatus(card, col.dataset.col); Store.persist(); render(); }
      };
    });
    board.querySelectorAll('[data-add]').forEach(b =>
      b.onclick = () => openForm(null, b.dataset.add));
    const archBtn = document.getElementById('archiveSummitedBtn');
    if(archBtn) archBtn.onclick = archiveOldSummited;
    board.querySelectorAll('[data-sub]').forEach(cb => {
      cb.onclick = e => e.stopPropagation();   // don't open the edit form
      cb.onchange = e => {
        const [cardId, idx] = e.target.dataset.sub.split(':');
        const card = Store.data.cards.find(k => k.id === cardId);
        if(card && card.subtasks[idx]){ card.subtasks[idx].done = e.target.checked; Store.persist(); render(); }
      };
    });
  }

  function openForm(id, status){
    const k = id ? Store.data.cards.find(x => x.id === id) : {status: status||'todo', subtasks:[]};
    Modal.open(`
      <h2>${id ? 'Edit card' : 'New card'}</h2>
      <div class="field"><label>Description</label>
        <input id="k-title" value="${esc(k.title||'')}" placeholder="Short summary of the task"></div>
      <div class="field"><label>Details</label>
        <textarea id="k-details" placeholder="Context, notes, acceptance criteria…">${esc(k.details||'')}</textarea></div>
      <div class="field"><label>Subtasks</label>
        <div class="subtasks" id="k-subs"></div>
        <button class="add-sub" id="k-addsub">+ Add subtask</button></div>
      <div class="field-row">
        <div class="field"><label>Label / category</label>
          <select id="k-label">${Object.keys(LABELS).map(l =>
            `<option value="${esc(l)}" ${k.label===l?'selected':''}>${l||'— none —'}</option>`).join('')}</select></div>
        <div class="field"><label>Priority</label>
          <select id="k-priority">${Object.entries(PRIORITIES).map(([v,p]) =>
            `<option value="${v}" ${(k.priority||'')===v?'selected':''}>${p.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Client / expedition</label>
        <input id="k-client" value="${esc(k.client||'')}" placeholder="Client or project name" list="clientlist">
        <datalist id="clientlist">${[...new Set(Store.data.cards.map(x=>x.client).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field-row">
        <div class="field"><label>Due date</label>
          <input type="date" id="k-due" value="${esc(k.due||'')}"></div>
        <div class="field"><label>Stage</label>
          <select id="k-status">${COLS.map(c =>
            `<option value="${c.id}" ${k.status===c.id?'selected':''}>${c.title}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Linked notes</label>
        <div class="linked-notes" id="k-notes"></div>
        <div class="note-link-add">
          <select id="k-noteselect"><option value="">+ Link a Field Note…</option></select>
        </div></div>
      <div class="modal-actions">
        ${id ? `<button class="btn-danger" id="k-del">Delete</button>`:''}
        <button class="btn-secondary" id="k-cancel">Cancel</button>
        <button class="btn-primary" id="k-save">${id?'Save':'Add card'}</button>
      </div>
    `);
    const $ = s => document.getElementById(s);
    let subs = (k.subtasks||[]).map(s=>({...s}));
    function drawSubs(){
      $('k-subs').innerHTML = subs.map((s,i) => `
        <div class="subtask">
          <input type="checkbox" data-i="${i}" ${s.done?'checked':''}>
          <input type="text" data-t="${i}" value="${esc(s.text)}" placeholder="Step…">
          <button class="rm" data-r="${i}">×</button>
        </div>`).join('');
      $('k-subs').querySelectorAll('[data-i]').forEach(c=>c.onchange=e=>subs[e.target.dataset.i].done=e.target.checked);
      $('k-subs').querySelectorAll('[data-t]').forEach(c=>c.oninput=e=>subs[e.target.dataset.t].text=e.target.value);
      $('k-subs').querySelectorAll('[data-r]').forEach(c=>c.onclick=e=>{subs.splice(e.target.dataset.r,1);drawSubs();});
    }
    drawSubs();
    $('k-addsub').onclick = () => { subs.push({text:'',done:false}); drawSubs(); };

    // ---- linked notes ----
    let noteIds = (k.noteIds||[]).slice();
    function drawNotes(){
      const notes = Store.data.notes||[];
      const linked = noteIds.map(nid => notes.find(n=>n.id===nid)).filter(Boolean);
      $('k-notes').innerHTML = linked.length
        ? linked.map(n => `<span class="note-chip"><span class="note-chip-name">${esc(n.title||'Untitled note')}</span><button class="note-chip-rm" data-unlink="${n.id}">×</button></span>`).join('')
        : `<span class="note-chip-empty">No notes linked.</span>`;
      $('k-notes').querySelectorAll('[data-unlink]').forEach(b =>
        b.onclick = () => { noteIds = noteIds.filter(id => id !== b.dataset.unlink); drawNotes(); drawNoteOptions(); });
      // open the note when clicking its name (only meaningful while editing existing)
      $('k-notes').querySelectorAll('.note-chip-name').forEach((el,i) =>
        el.onclick = () => { Modal.close(); App.openNote(linked[i].id); });
    }
    function drawNoteOptions(){
      const notes = (Store.data.notes||[]).filter(n => !n.archived && !noteIds.includes(n.id));
      $('k-noteselect').innerHTML = `<option value="">+ Link a Field Note…</option>` +
        notes.map(n => `<option value="${n.id}">${esc(n.title||'Untitled note')}</option>`).join('');
    }
    drawNotes(); drawNoteOptions();
    $('k-noteselect').onchange = e => {
      if(e.target.value){ noteIds.push(e.target.value); drawNotes(); drawNoteOptions(); e.target.value=''; }
    };

    $('k-cancel').onclick = Modal.close;
    if(id) $('k-del').onclick = () => { remove(id); Modal.close(); };
    $('k-save').onclick = () => {
      const title = $('k-title').value.trim();
      if(!title){ Toast.show('Description is required'); return; }
      const newStatus = $('k-status').value;
      const enteringSummit = newStatus === 'summit' && k.status !== 'summit';
      const leavingSummit = newStatus !== 'summit' && k.status === 'summit';
      const rec = {
        id: id || Store.uid(), title,
        details: $('k-details').value.trim(),
        subtasks: subs.filter(s=>s.text.trim()),
        label: $('k-label').value,
        priority: $('k-priority').value,
        client: $('k-client').value.trim(),
        due: $('k-due').value,
        status: newStatus,
        noteIds: noteIds,
        archived: k.archived || false,
        summitedAt: enteringSummit ? Date.now() : (leavingSummit ? null : k.summitedAt)
      };
      if(id){ const i=Store.data.cards.findIndex(x=>x.id===id); Store.data.cards[i]=rec; }
      else Store.data.cards.push(rec);
      Store.persist(); render(); Modal.close();
      Toast.show(id?'Card updated':'Card added');
    };
  }

  const ARCHIVE_AGE_DAYS = 7;
  function archiveOldSummited(){
    const cutoff = Date.now() - ARCHIVE_AGE_DAYS*864e5;
    const eligible = Store.data.cards.filter(k =>
      k.status === 'summit' && !k.archived && k.summitedAt && k.summitedAt < cutoff);
    if(!eligible.length){ Toast.show(`Nothing older than ${ARCHIVE_AGE_DAYS} days to archive`); return; }
    eligible.forEach(k => k.archived = true);
    Store.persist(); render();
    App.refreshKPIs && App.refreshKPIs();
    Toast.show(`Archived ${eligible.length} card${eligible.length>1?'s':''} — see Expeditions → Completed work`);
  }

  function remove(id){
    Store.data.cards = Store.data.cards.filter(k => k.id !== id);
    Store.persist(); render(); Toast.show('Card removed');
  }

  // ===== Quick-add parser =====
  const PRIO_ALIASES = { urgent:'urgent', high:'high', med:'medium', medium:'medium', low:'low' };
  const DAYS = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
  const LABEL_LOOKUP = () => {
    const m = {};
    Object.keys(LABELS).filter(Boolean).forEach(l => m[l.toLowerCase()] = l);
    return m;
  };

  function parse(raw){
    const out = { title:'', label:'', priority:'', due:'', status:'todo', subtasks:[], client:'' };
    if(!raw || !raw.trim()) return out;
    const labels = LABEL_LOOKUP();
    const titleParts = [];
    const tokens = raw.trim().split(/\s+/);
    for(let i=0;i<tokens.length;i++){
      const t = tokens[i];
      if(t.startsWith('#')){
        const key = t.slice(1).toLowerCase();
        if(labels[key]) out.label = labels[key];
      } else if(t.startsWith('@')){
        out.client = t.slice(1).replace(/[-_]/g,' ');
      } else if(t.startsWith('!')){
        const p = PRIO_ALIASES[t.slice(1).toLowerCase()];
        if(p) out.priority = p;          // sets the priority field (low/medium/high/urgent)
      } else if(t.startsWith('~')){
        const d = parseDate(t.slice(1));
        if(d) out.due = d;
      } else if(t.startsWith('>')){
        const s = t.slice(1).toLowerCase();
        const col = COLS.find(c => c.id===s || c.title.toLowerCase().startsWith(s));
        if(col) out.status = col.id;
      } else if(t.startsWith('+')){
        // a subtask runs until the next token that starts with a control char
        let words = [t.slice(1)];
        while(i+1 < tokens.length && !/^[#!~>+]/.test(tokens[i+1])){ words.push(tokens[++i]); }
        const text = words.join(' ').trim();
        if(text) out.subtasks.push({text, done:false});
      } else {
        titleParts.push(t);
      }
    }
    out.title = titleParts.join(' ').trim();
    return out;
  }

  function parseDate(str){
    str = str.toLowerCase();
    const today = new Date(); today.setHours(0,0,0,0);
    if(str==='today') return iso(today);
    if(str==='tomorrow' || str==='tmrw'){ const d=new Date(today); d.setDate(d.getDate()+1); return iso(d); }
    if(DAYS.hasOwnProperty(str.slice(0,3))){
      const target = DAYS[str.slice(0,3)]; const d=new Date(today);
      let diff = (target - d.getDay() + 7) % 7; if(diff===0) diff=7; // next occurrence
      d.setDate(d.getDate()+diff); return iso(d);
    }
    // m/d or m/d/yy
    let m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if(m){ let y = m[3]?(+m[3]<100?2000+ +m[3]:+m[3]):today.getFullYear();
      const d=new Date(y, +m[1]-1, +m[2]); if(d<today && !m[3]) d.setFullYear(y+1); return iso(d); }
    // ISO yyyy-mm-dd
    if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return '';
  }
  function iso(d){ return d.toISOString().slice(0,10); }

  function commitQuickAdd(){
    const inp = document.getElementById('quickAddInput');
    const parsed = parse(inp.value);
    if(!parsed.title){ Toast.show('Add a description'); return; }
    Store.data.cards.push({
      id: Store.uid(), title: parsed.title, details:'',
      subtasks: parsed.subtasks, label: parsed.label,
      priority: parsed.priority, due: parsed.due, status: parsed.status,
      client: parsed.client, archived: false,
      summitedAt: parsed.status === 'summit' ? Date.now() : null
    });
    Store.persist(); render();
    inp.value=''; updatePreview();
    Toast.show('Card added to '+(COLS.find(c=>c.id===parsed.status).title));
  }

  let helpOn = false;   // persists independently of the live preview

  function updatePreview(){
    const inp = document.getElementById('quickAddInput');
    const hint = document.getElementById('quickAddHint');
    const v = inp.value.trim();
    if(!v){ hint.hidden = true; return; }
    const p = parse(v);
    const lblColor = LABELS[p.label] ?? '#9aa7b5';
    const prio = PRIORITIES[p.priority||''] || PRIORITIES[''];
    const stage = COLS.find(c=>c.id===p.status).title;
    hint.className = 'quickadd-hint preview';
    hint.hidden = false;
    hint.innerHTML = `<div class="qa-preview-row">
      <span class="qa-preview-label">Preview</span>
      <strong>${esc(p.title||'(no title yet)')}</strong>
      ${prio.rank>0?`<span class="qa-meta" style="color:${prio.color};font-weight:600">▲ ${prio.label}</span>`:''}
      ${p.label?`<span class="qa-pill" style="background:${lblColor}">${esc(p.label)}</span>`:''}
      ${p.client?`<span class="qa-meta">🏔 ${esc(p.client)}</span>`:''}
      ${p.due?`<span class="qa-meta">⚑ ${esc(fmtDue(new Date(p.due+'T00:00:00')))}</span>`:''}
      ${p.subtasks.length?`<span class="qa-meta">☑ ${p.subtasks.length} subtask${p.subtasks.length>1?'s':''}</span>`:''}
      <span class="qa-meta">→ ${esc(stage)}</span>
    </div>`;
  }

  function renderHelp(){
    const hint = document.getElementById('quickAddHelpHint');
    hint.hidden = !helpOn;
    if(!helpOn) return;
    hint.className = 'quickadd-hint';
    hint.innerHTML = `<div class="qa-syntax">
      <code>#label</code><span>Epic, Review, Admin, Urgent, Personal</span>
      <code>@client</code><span>Client / expedition name</span>
      <code>!high</code><span>Priority — low, medium, high, urgent</span>
      <code>~fri</code><span>Due date — fri, tomorrow, 6/15, 2026-07-01</span>
      <code>&gt;climbing</code><span>Start stage — base, climbing, summited</span>
      <code>+text</code><span>Add a subtask (repeatable)</span>
    </div>`;
  }

  function toggleHelp(){
    helpOn = !helpOn;
    document.getElementById('quickAddHelp').classList.toggle('active', helpOn);
    renderHelp();
  }

  function init(){
    document.getElementById('addCardBtn').onclick = () => openForm();
    compact = localStorage.getItem('basecamp.compact') === '1';
    const ct = document.getElementById('compactToggle');
    ct.textContent = compact ? 'Detailed' : 'Compact';
    ct.classList.toggle('active', compact);
    ct.onclick = () => {
      compact = !compact;
      localStorage.setItem('basecamp.compact', compact ? '1':'0');
      ct.textContent = compact ? 'Detailed' : 'Compact';
      ct.classList.toggle('active', compact);
      render();
    };
    const inp = document.getElementById('quickAddInput');
    inp.oninput = () => updatePreview();
    inp.onkeydown = e => { if(e.key==='Enter') commitQuickAdd(); };
    document.getElementById('quickAddHelp').onclick = toggleHelp;
  }
  return { render, init, COLS };
})();
