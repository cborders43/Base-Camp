/* ===== Supply Cache (URL / file-path manager) ===== */
const Cache = (() => {
  let activeCat = 'All';
  let query = '';

  function render(){
    const grid = document.getElementById('cacheGrid');
    const supplies = Store.data.supplies;
    renderCats();

    let list = supplies.filter(s => activeCat === 'All' || s.category === activeCat);
    if(query){
      const q = query.toLowerCase();
      list = list.filter(s =>
        (s.title||'').toLowerCase().includes(q) ||
        (s.url||'').toLowerCase().includes(q) ||
        (s.path||'').toLowerCase().includes(q) ||
        (s.tags||[]).some(t => t.toLowerCase().includes(q)));
    }

    if(supplies.length === 0){
      grid.innerHTML = `<div class="empty-state"><div class="big">🎒</div>
        <p>Your cache is empty. Stash the links and file paths you reach for every day.</p></div>`;
      return;
    }
    if(list.length === 0){
      grid.innerHTML = `<div class="empty-state"><p>No supplies match that.</p></div>`;
      return;
    }

    grid.innerHTML = list.map(s => supplyCard(s)).join('');

    grid.querySelectorAll('.supply-title').forEach(el =>
      el.onclick = () => { const u = el.dataset.url; if(u) window.open(u, '_blank', 'noopener'); });
    grid.querySelectorAll('.supply-path').forEach(el =>
      el.onclick = () => { copyText(el.dataset.path); Toast.show('Path copied'); });
    grid.querySelectorAll('[data-edit]').forEach(el =>
      el.onclick = e => { e.stopPropagation(); openForm(el.dataset.edit); });
    grid.querySelectorAll('[data-del]').forEach(el =>
      el.onclick = e => { e.stopPropagation(); remove(el.dataset.del); });
  }

  function supplyCard(s){
    const fav = s.url ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url)}&sz=64" onerror="this.style.display='none';this.parentNode.textContent='🔗'">` : '📁';
    const tags = (s.tags||[]).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="supply">
      ${s.category ? `<span class="supply-cat">${esc(s.category)}</span>` : ''}
      <div class="supply-top">
        <span class="favicon">${fav}</span>
        <span class="supply-title" data-url="${esc(s.url||'')}" title="${esc(s.url||s.title)}">${esc(s.title)}</span>
      </div>
      ${s.path ? `<span class="supply-path" data-path="${esc(s.path)}" title="Click to copy">${esc(s.path)}</span>` : ''}
      ${tags ? `<div class="supply-tags">${tags}</div>` : ''}
      <div class="supply-menu">
        <button class="icon-btn" data-edit="${s.id}" title="Edit">✎</button>
        <button class="icon-btn" data-del="${s.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  function renderCats(){
    const cats = ['All', ...new Set(Store.data.supplies.map(s => s.category).filter(Boolean))];
    const row = document.getElementById('cacheCats');
    row.innerHTML = cats.map(c =>
      `<button class="chip ${c===activeCat?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    row.querySelectorAll('.chip').forEach(ch =>
      ch.onclick = () => { activeCat = ch.dataset.cat; render(); });
  }

  function openForm(id){
    const s = id ? Store.data.supplies.find(x => x.id === id) : {};
    Modal.open(`
      <h2>${id ? 'Edit supply' : 'Cache a supply'}</h2>
      <div class="field"><label>Name</label><input id="f-title" value="${esc(s.title||'')}" placeholder="Epic dashboard, SharePoint, etc."></div>
      <div class="field"><label>URL <span style="color:var(--crevasse);font-weight:400">(left-click opens in new tab)</span></label>
        <input id="f-url" value="${esc(s.url||'')}" placeholder="https://…"></div>
      <div class="field"><label>File path <span style="color:var(--crevasse);font-weight:400">(click-to-copy)</span></label>
        <input id="f-path" value="${esc(s.path||'')}" placeholder="\\\\server\\share\\folder"></div>
      <div class="field-row">
        <div class="field"><label>Category</label><input id="f-cat" value="${esc(s.category||'')}" placeholder="Epic, Admin, Tools…" list="catlist">
          <datalist id="catlist">${[...new Set(Store.data.supplies.map(x=>x.category).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>Tags <span style="color:var(--crevasse);font-weight:400">(comma-sep)</span></label>
          <input id="f-tags" value="${esc((s.tags||[]).join(', '))}" placeholder="review, prod"></div>
      </div>
      <div class="modal-actions">
        ${id ? `<button class="btn-danger" id="m-del">Delete</button>` : ''}
        <button class="btn-secondary" id="m-cancel">Cancel</button>
        <button class="btn-primary" id="m-save">${id?'Save':'Cache it'}</button>
      </div>
    `);
    const $ = s => document.getElementById(s);
    $('m-cancel').onclick = Modal.close;
    if(id) $('m-del').onclick = () => { remove(id); Modal.close(); };
    $('m-save').onclick = () => {
      const title = $('f-title').value.trim();
      const url = $('f-url').value.trim();
      const path = $('f-path').value.trim();
      if(!title){ Toast.show('Name is required'); return; }
      if(!url && !path){ Toast.show('Add a URL or a file path'); return; }
      const rec = {
        id: id || Store.uid(), title, url, path,
        category: $('f-cat').value.trim(),
        tags: $('f-tags').value.split(',').map(t=>t.trim()).filter(Boolean)
      };
      if(id){ const i = Store.data.supplies.findIndex(x=>x.id===id); Store.data.supplies[i]=rec; }
      else Store.data.supplies.unshift(rec);
      Store.persist(); render(); Modal.close();
      Toast.show(id ? 'Supply updated' : 'Supply cached');
    };
  }

  function remove(id){
    Store.data.supplies = Store.data.supplies.filter(s => s.id !== id);
    Store.persist(); render(); Toast.show('Supply removed');
  }

  function init(){
    document.getElementById('addLinkBtn').onclick = () => openForm();
    document.getElementById('cacheSearch').oninput = e => { query = e.target.value; render(); };
  }

  return { render, init, openForm };
})();

function esc(s){ return String(s??'').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Cross-browser clipboard copy — falls back to execCommand for Firefox over file://
function copyText(text){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).catch(()=>legacyCopy(text));
  } else { legacyCopy(text); }
}
function legacyCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand('copy'); }catch(e){ Toast.show('Copy not supported — select manually'); }
  document.body.removeChild(ta);
}
