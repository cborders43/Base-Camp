/* ===== Base Camp store.js — adaptive persistence ===== */
const Store = (() => {
  const KEY = 'basecamp.data.v1';
  const META = 'basecamp.meta.v1';
  let data = blank();
  let dirtySinceBackup = false;   // changes made since last backup?

  function blank(){
    return {
      version: 1,
      supplies: [],   // {id,title,url,path,category,tags[]}
      cards: [],      // {id,title,details,subtasks[{text,done}],label,category,due,status}
      notes: [],      // {id,title,body,created,updated,archived}
      trackers: [],   // {id,name,cadence,weeklyTarget,color,created,archived,log:{date:true}}
      updated: Date.now()
    };
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw) data = Object.assign(blank(), JSON.parse(raw));
    }catch(e){ console.warn('Load failed, starting fresh', e); }
    return data;
  }

  function persist(){
    data.updated = Date.now();
    dirtySinceBackup = true;
    try{ localStorage.setItem(KEY, JSON.stringify(data)); }
    catch(e){ Toast.show('Storage full — export a backup'); }
    App.refreshKPIs && App.refreshKPIs();
    App.checkBackupNudge && App.checkBackupNudge();
  }

  // ---- export / import ----
  function exportJSON(){
    download(`basecamp-backup-${stamp()}.json`, JSON.stringify(data, null, 2));
    Toast.show('Backup downloaded');
  }
  function importJSON(file){
    const r = new FileReader();
    r.onload = () => {
      try{
        const incoming = JSON.parse(r.result);
        if(!incoming.version) throw new Error('not a Base Camp file');
        data = Object.assign(blank(), incoming);
        persist(); App.renderAll();
        Toast.show('Backup restored');
      }catch(e){ Toast.show('Could not read that file'); }
    };
    r.readAsText(file);
  }

  // ---- daily backup nudge (shows a one-click banner, never auto-downloads) ----
  function backupDue(){
    try{
      const meta = JSON.parse(localStorage.getItem(META) || '{}');
      const today = new Date().toISOString().slice(0,10);
      if(meta.lastBackup === today) return false;          // already backed up today
      if((data.supplies.length + data.cards.length) === 0) return false; // nothing to save
      return true;
    }catch(e){ return false; }
  }
  function markBackedUp(){
    try{
      const meta = JSON.parse(localStorage.getItem(META) || '{}');
      meta.lastBackup = new Date().toISOString().slice(0,10);
      localStorage.setItem(META, JSON.stringify(meta));
    }catch(e){}
  }
  function doBackup(){
    download(`basecamp-backup-${new Date().toISOString().slice(0,10)}.json`,
      JSON.stringify(data, null, 2));
    markBackedUp();
    Toast.show('Backup saved');
  }

  // ---- helpers ----
  function download(name, text, type){
    const b = new Blob([text], {type: type||'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  }
  function stamp(){ return new Date().toISOString().replace(/[:T]/g,'-').slice(0,16); }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  // ---- Markdown status snapshot (for pasting into Claude) ----
  function snapshotMarkdown(){
    const today = new Date(); today.setHours(0,0,0,0);
    const todayK = dk(today);
    const dayName = today.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const STAGES = {todo:'Base Camp (queued)', climbing:'Climbing (in progress)', summit:'Summited (done)'};
    const PRIO = {urgent:'Urgent', high:'High', medium:'Medium', low:'Low', '':''};

    let m = `# Base Camp — status snapshot\n`;
    m += `_${dayName}_\n\n`;
    m += `This is a point-in-time snapshot of my work HQ. Please review it and give me a concise read on where things stand: what's most urgent, what's overdue or at risk, what I should focus on next, and anything that looks stalled or inconsistent.\n\n---\n`;

    const cards = data.cards || [];
    // Overdue / due soon
    const dated = cards.filter(c => c.due && c.status!=='summit')
      .map(c => ({...c, days: Math.round((fromK(c.due) - today)/864e5)}))
      .sort((a,b)=>a.days-b.days);
    const overdue = dated.filter(c => c.days < 0);
    const soon = dated.filter(c => c.days >= 0 && c.days <= 7);

    if(overdue.length || soon.length){
      m += `\n## ⚑ Deadlines\n`;
      overdue.forEach(c => m += `- **OVERDUE ${-c.days}d** — ${c.title}${prioTag(c)}\n`);
      soon.forEach(c => m += `- ${c.days===0?'**Due today**':'Due in '+c.days+'d'} (${c.due}) — ${c.title}${prioTag(c)}\n`);
    }

    // Cards by stage
    ['climbing','todo','summit'].forEach(stage => {
      const inStage = cards.filter(c => c.status===stage);
      if(!inStage.length) return;
      // sort by priority
      inStage.sort((a,b)=>prioRank(b.priority)-prioRank(a.priority));
      m += `\n## ${STAGES[stage]} — ${inStage.length}\n`;
      inStage.forEach(c => {
        m += `- ${c.title}${prioTag(c)}${c.label?` _[${c.label}]_`:''}${c.due?` · due ${c.due}`:''}\n`;
        if(c.details) m += `  - ${c.details.replace(/\n+/g,' ').slice(0,160)}\n`;
        (c.subtasks||[]).forEach(s => m += `  - [${s.done?'x':' '}] ${s.text}\n`);
      });
    });

    // Habits
    const trackers = (data.trackers||[]).filter(t=>!t.archived);
    if(trackers.length){
      m += `\n## 📈 Habits (Summit Log)\n`;
      trackers.forEach(t => {
        const done = !!(t.log||{})[todayK];
        m += `- ${t.name} _(${t.cadence})_ — logged today: ${done?'yes':'no'}\n`;
      });
    }

    // Recent notes (titles only)
    const notes = (data.notes||[]).filter(n=>!n.archived)
      .sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,10);
    if(notes.length){
      m += `\n## 📓 Recent notes\n`;
      notes.forEach(n => m += `- ${n.title||'Untitled'} _(updated ${new Date(n.updated).toLocaleDateString()})_\n`);
      m += `\n_(Note bodies omitted — use Field Notes export if you want the full text summarized.)_\n`;
    }

    return m;

    function prioRank(p){ return ({urgent:4,high:3,medium:2,low:1}[p]||0); }
    function prioTag(c){ return c.priority ? ` _(${PRIO[c.priority]} priority)_` : ''; }
  }
  function dk(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function fromK(k){ const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); }

  function exportSnapshot(){
    download(`basecamp-snapshot-${new Date().toISOString().slice(0,10)}.md`, snapshotMarkdown(), 'text/markdown');
    Toast.show('Snapshot exported');
  }

  return {
    get data(){ return data; },
    load, persist, exportJSON, importJSON, uid,
    backupDue, doBackup, exportSnapshot
  };
})();
