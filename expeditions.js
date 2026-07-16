/* ===== Expeditions (client / project dashboard) =====
   Derives one "expedition" per distinct card.client value found in The Ascent.
   Field Notes link to an expedition via their own client field (set directly
   in the note editor) — Notes.notesForClient() does the matching.
   Cards are still the source of truth for which clients exist — a note alone
   won't create a new expedition entry unless a card also has that client. */
const Expeditions = (() => {
  let query = '';
  let expandedClient = null;   // which card's note detail list is open
  let view = 'active';         // active | completed

  function groups(){
    const cards = (Store.data.cards || []).filter(c => !c.archived);
    const map = new Map();
    cards.forEach(c => {
      const key = (c.client || '').trim() || '__unassigned';
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    const today = new Date(); today.setHours(0,0,0,0);

    let list = [...map.entries()].map(([client, list]) => {
      const active = list.filter(c => c.status !== 'summit');
      const done = list.filter(c => c.status === 'summit');
      const dated = active.filter(c => c.due).map(c => ({
        ...c, days: Math.round((new Date(c.due+'T00:00:00') - today)/864e5)
      }));
      const overdue = dated.filter(c => c.days < 0).sort((a,b)=>a.days-b.days);
      const upcoming = dated.filter(c => c.days >= 0).sort((a,b)=>a.days-b.days);
      const next = overdue[0] || upcoming[0] || null;
      const notes = client === '__unassigned' ? [] : Notes.notesForClient(client);
      return {
        client, unassigned: client === '__unassigned',
        total: list.length, active: active.length, done: done.length,
        overdue: overdue.length, next,
        pct: list.length ? Math.round((done.length/list.length)*100) : 0,
        notes
      };
    });

    if(query){
      const q = query.toLowerCase();
      list = list.filter(g => (g.unassigned ? 'unassigned' : g.client.toLowerCase()).includes(q));
    }

    // overdue clients first, then most active work, unassigned always last
    list.sort((a,b) => {
      if(a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
      if((b.overdue>0) !== (a.overdue>0)) return b.overdue - a.overdue;
      if(b.active !== a.active) return b.active - a.active;
      return a.client.localeCompare(b.client);
    });
    return list;
  }

  // Groups archived (completed-and-cleared) cards by client for the audit view.
  function archivedGroups(){
    const cards = (Store.data.cards || []).filter(c => c.archived);
    const map = new Map();
    cards.forEach(c => {
      const key = (c.client || '').trim() || '__unassigned';
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    let list = [...map.entries()].map(([client, list]) => ({
      client, unassigned: client === '__unassigned',
      cards: list.slice().sort((a,b) => (b.summitedAt||0) - (a.summitedAt||0))
    }));
    if(query){
      const q = query.toLowerCase();
      list = list.filter(g => (g.unassigned ? 'unassigned' : g.client.toLowerCase()).includes(q));
    }
    list.sort((a,b) => {
      if(a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
      return a.client.localeCompare(b.client);
    });
    return list;
  }

  function render(){
    const grid = document.getElementById('expoGrid');
    const countEl = document.getElementById('expoCount');
    if(view === 'completed'){ renderCompleted(grid, countEl); return; }

    const all = (Store.data.cards || []).filter(c => !c.archived);
    if(all.length === 0){
      grid.innerHTML = `<div class="empty-state"><div class="big">🏔</div>
        <p>No cards yet. Add cards in The Ascent and tag them with a client to see them grouped here.</p></div>`;
      countEl.textContent = '';
      return;
    }

    const list = groups();
    const namedCount = list.filter(g => !g.unassigned).length;
    countEl.textContent = `${namedCount} expedition${namedCount===1?'':'s'}`;

    if(list.length === 0){
      grid.innerHTML = `<div class="empty-state"><p>No expeditions match that search.</p></div>`;
      return;
    }

    grid.innerHTML = list.map(card).join('');

    grid.querySelectorAll('.expo-open').forEach(el =>
      el.onclick = e => { e.stopPropagation(); jumpToClient(el.closest('[data-expo]').dataset.expo); });
    grid.querySelectorAll('.expo-notes-toggle').forEach(el =>
      el.onclick = e => { e.stopPropagation();
        const client = el.closest('[data-expo]').dataset.expo;
        expandedClient = expandedClient === client ? null : client;
        render();
      });
    grid.querySelectorAll('[data-note-open]').forEach(el =>
      el.onclick = e => { e.stopPropagation(); App.openNote(el.dataset.noteOpen); });
  }

  function renderCompleted(grid, countEl){
    const list = archivedGroups();
    const totalCards = list.reduce((n,g) => n + g.cards.length, 0);
    countEl.textContent = totalCards ? `${totalCards} archived card${totalCards===1?'':'s'}` : '';

    if(totalCards === 0){
      grid.innerHTML = `<div class="empty-state"><div class="big">📦</div>
        <p>Nothing archived yet. Use "Archive old" in The Ascent's Summited column to move completed work here.</p></div>`;
      return;
    }

    grid.innerHTML = `<div class="expo-completed-list">${list.map(completedGroup).join('')}</div>`;
  }

  function completedGroup(g){
    const name = g.unassigned ? 'Unassigned' : g.client;
    const icon = g.unassigned ? '📦' : '🏔';
    return `<div class="expo-completed-group">
      <div class="expo-completed-head">
        <span class="expo-ico">${icon}</span>
        <span class="expo-name">${esc(name)}</span>
        <span class="expo-completed-count">${g.cards.length}</span>
      </div>
      <ul class="expo-completed-cards">
        ${g.cards.map(c => `<li>
          <span class="expo-completed-title">${esc(c.title)}</span>
          <span class="expo-completed-date">${fmtDate(c.summitedAt)}</span>
        </li>`).join('')}
      </ul>
    </div>`;
  }

  function card(g){
    const name = g.unassigned ? 'Unassigned' : g.client;
    const icon = g.unassigned ? '📦' : '🏔';
    let nextHtml = `<span class="expo-next-empty">Clear skies</span>`;
    if(g.next){
      const overdue = g.next.days < 0;
      const label = overdue ? `⚑ ${-g.next.days}d overdue`
                  : g.next.days === 0 ? 'Due today'
                  : `Due ${fmt(g.next.due)}`;
      nextHtml = `<span class="expo-next ${overdue?'over':g.next.days<=2?'soon':''}">${label}</span>
        <span class="expo-next-title">${esc(g.next.title)}</span>`;
    }
    const expanded = expandedClient === g.client;
    const notesBadge = g.unassigned ? '' : `<button class="expo-notes-toggle ${expanded?'active':''}">📓 ${g.notes.length}</button>`;
    const notesDetail = (!g.unassigned && expanded) ? notesDetailHtml(g.notes) : '';
    return `<div class="card expo-card ${g.unassigned?'unassigned':''}" data-expo="${esc(g.client)}">
      <div class="expo-head">
        <span class="expo-ico">${icon}</span>
        <span class="expo-name">${esc(name)}</span>
        ${g.overdue>0 ? `<span class="expo-flag">${g.overdue} overdue</span>` : ''}
      </div>
      <div class="expo-bar"><div class="expo-bar-fill" style="width:${g.pct}%"></div></div>
      <div class="expo-stats">
        <span><strong>${g.active}</strong> active</span>
        <span><strong>${g.done}</strong> summited</span>
        <span><strong>${g.total}</strong> total</span>
      </div>
      <div class="expo-next-row">${nextHtml}</div>
      <div class="expo-foot-row">
        <button class="link-btn expo-open">Open in The Ascent →</button>
        ${notesBadge}
      </div>
      ${notesDetail}
    </div>`;
  }

  function notesDetailHtml(notes){
    if(!notes.length) return `<div class="expo-notes-detail"><span class="expo-notes-empty">No linked field notes.</span></div>`;
    const sorted = notes.slice().sort((a,b)=>(b.updated||0)-(a.updated||0));
    return `<div class="expo-notes-detail">
      ${sorted.map(n => `<div class="expo-note-item" data-note-open="${n.id}">
        <span class="expo-note-title">${esc(n.title||'Untitled note')}</span>
        <span class="expo-note-date">${fmtDate(n.updated)}</span>
      </div>`).join('')}
    </div>`;
  }

  function jumpToClient(client){
    App.switchTab('ascent');
    setTimeout(() => {
      const board = document.getElementById('board');
      if(!board) return;
      board.querySelectorAll('.kcard').forEach(el => el.classList.remove('expo-highlight'));
      const cards = Store.data.cards.filter(c => (c.client||'').trim() === client || (client==='__unassigned' && !c.client));
      const ids = new Set(cards.map(c=>c.id));
      board.querySelectorAll('.kcard').forEach(el => {
        if(ids.has(el.dataset.id)){
          el.classList.add('expo-highlight');
          el.scrollIntoView({behavior:'smooth', block:'center'});
        }
      });
      setTimeout(() => board.querySelectorAll('.kcard').forEach(el => el.classList.remove('expo-highlight')), 2200);
    }, 80);
  }

  function fmt(d){ return new Date(d+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function fmtDate(ts){ if(!ts) return ''; return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

  function init(){
    const search = document.getElementById('expoSearch');
    if(search) search.oninput = e => { query = e.target.value; render(); };
    document.querySelectorAll('#tab-expeditions [data-expoview]').forEach(b =>
      b.onclick = () => {
        view = b.dataset.expoview;
        document.querySelectorAll('#tab-expeditions [data-expoview]').forEach(x => x.classList.toggle('active', x===b));
        render();
      });
  }

  return { render, init };
})();
