/* ===== Command palette (Ctrl/Cmd+K) ===== */
const Palette = (() => {
  let open = false;
  let results = [];
  let active = 0;
  let bd, input, list;

  const COMMANDS = [
    {type:'nav', label:'Go to Base Camp',     hint:'Dashboard', act:()=>App.switchTab('dashboard')},
    {type:'nav', label:'Go to Supply Cache',  hint:'Links & paths', act:()=>App.switchTab('cache')},
    {type:'nav', label:'Go to The Ascent',    hint:'Kanban', act:()=>App.switchTab('ascent')},
    {type:'nav', label:'Go to Expeditions',   hint:'Clients & projects', act:()=>App.switchTab('expeditions')},
    {type:'nav', label:'Go to Field Notes',   hint:'Notes', act:()=>App.switchTab('notes')},
    {type:'nav', label:'Go to Summit Log',    hint:'Habits', act:()=>App.switchTab('summit')},
    {type:'action', label:'New card',     hint:'The Ascent', act:()=>{App.switchTab('ascent'); document.getElementById('addCardBtn').click();}},
    {type:'action', label:'New note',     hint:'Field Notes', act:()=>{App.switchTab('notes'); document.getElementById('addNoteBtn').click();}},
    {type:'action', label:'Cache a supply', hint:'Supply Cache', act:()=>{App.switchTab('cache'); document.getElementById('addLinkBtn').click();}},
    {type:'action', label:'New route',    hint:'Summit Log', act:()=>{App.switchTab('summit'); document.getElementById('addTrackerBtn').click();}},
    {type:'action', label:'Export backup', hint:'Download JSON', act:()=>Store.exportJSON()},
    {type:'action', label:'Export snapshot', hint:'Markdown for Claude', act:()=>Store.exportSnapshot()},
    {type:'action', label:'Toggle theme', hint:'Light / dark', act:()=>document.getElementById('themeToggle').click()},
  ];

  function search(q){
    const ql = q.toLowerCase().trim();
    const out = [];
    // commands first (always available)
    COMMANDS.forEach(c => { if(!ql || c.label.toLowerCase().includes(ql)) out.push(c); });
    if(ql){
      const d = Store.data;
      (d.supplies||[]).forEach(s => {
        if(match(ql, s.title, s.url, s.path, (s.tags||[]).join(' '), s.category))
          out.push({type:'supply', label:s.title, hint:s.url?'URL':'Path', act:()=>{
            if(s.url) window.open(s.url,'_blank','noopener'); else { App.switchTab('cache'); }
          }});
      });
      (d.cards||[]).forEach(c => {
        if(match(ql, c.title, c.details, c.label))
          out.push({type:'card', label:c.title, hint:'Card · '+statusName(c.status), act:()=>{App.switchTab('ascent');}});
      });
      (d.notes||[]).forEach(n => {
        if(match(ql, n.title, n.body))
          out.push({type:'note', label:n.title||'Untitled note', hint:'Note', act:()=>App.openNote(n.id)});
      });
      (d.trackers||[]).forEach(t => {
        if(!t.archived && match(ql, t.name))
          out.push({type:'tracker', label:t.name, hint:'Route', act:()=>App.switchTab('summit')});
      });
    }
    return out.slice(0, 40);
  }
  function match(q, ...fields){ return fields.some(f => (f||'').toString().toLowerCase().includes(q)); }
  function statusName(s){ return ({todo:'Base Camp',climbing:'Climbing',summit:'Summited'})[s]||s; }

  const ICONS = {nav:'→', action:'＋', supply:'🎒', card:'🧗', note:'📓', tracker:'📈'};

  function render(){
    list.innerHTML = results.length
      ? results.map((r,i)=>`<div class="pal-item ${i===active?'active':''}" data-i="${i}">
          <span class="pal-ico">${ICONS[r.type]||'·'}</span>
          <span class="pal-label">${esc(r.label)}</span>
          <span class="pal-hint">${esc(r.hint||'')}</span>
        </div>`).join('')
      : `<div class="pal-empty">No matches.</div>`;
    list.querySelectorAll('.pal-item').forEach(el => {
      el.onmousemove = () => { active = +el.dataset.i; highlight(); };
      el.onclick = () => choose(+el.dataset.i);
    });
  }
  function highlight(){
    list.querySelectorAll('.pal-item').forEach((el,i)=>el.classList.toggle('active', i===active));
    const el = list.querySelector('.pal-item.active');
    if(el) el.scrollIntoView({block:'nearest'});
  }
  function choose(i){
    const r = results[i]; if(!r) return;
    close(); r.act();
  }

  function show(){
    open = true; bd.classList.add('show');
    input.value=''; results = search(''); active = 0; render();
    setTimeout(()=>input.focus(), 30);
  }
  function close(){ open = false; bd.classList.remove('show'); }

  function init(){
    bd = document.getElementById('paletteBackdrop');
    input = document.getElementById('paletteInput');
    list = document.getElementById('paletteResults');

    document.addEventListener('keydown', e => {
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); open?close():show(); return; }
      if(!open) return;
      if(e.key==='Escape'){ close(); }
      else if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1, results.length-1); highlight(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1, 0); highlight(); }
      else if(e.key==='Enter'){ e.preventDefault(); choose(active); }
    });
    input.oninput = () => { results = search(input.value); active = 0; render(); };
    bd.onclick = e => { if(e.target===bd) close(); };
  }

  return { init, show };
})();
