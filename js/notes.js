/* ===== Field Notes ===== */
const Notes = (() => {
  let view = 'active';        // active | archived | all
  let query = '';
  let selected = new Set();
  let openId = null;          // note currently in editor
  let activeImg = null;       // currently-selected <img> in the editor, for resize controls

  const IMG_MAX_W = 1200;     // px, cap on paste
  const IMG_QUALITY = 0.7;    // jpeg quality on paste
  const SIZE_PRESETS = { s: 200, m: 400, l: 700 }; // px widths; 'full' = no inline width

  function visibleNotes(){
    let list = (Store.data.notes || []).slice();
    if(view === 'active') list = list.filter(n => !n.archived);
    else if(view === 'archived') list = list.filter(n => n.archived);
    if(query){
      const q = query.toLowerCase();
      list = list.filter(n => (n.title||'').toLowerCase().includes(q) || bodyText(n.body).toLowerCase().includes(q));
    }
    return list.sort((a,b) => (b.updated||0) - (a.updated||0));
  }

  function render(){
    renderList();
    renderEditor();
    renderSelbar();
  }

  function renderList(){
    const el = document.getElementById('notesList');
    const list = visibleNotes();
    if((Store.data.notes||[]).length === 0){
      el.innerHTML = `<div class="notes-empty"><div class="big">📓</div>
        <p>No notes yet. Capture a thought, a meeting takeaway, a half-formed idea.</p></div>`;
      return;
    }
    if(list.length === 0){ el.innerHTML = `<div class="notes-empty"><p>Nothing here.</p></div>`; return; }
    el.innerHTML = list.map(n => {
      const sel = selected.has(n.id);
      const preview = bodyText(n.body).replace(/\s+/g,' ').trim().slice(0,90);
      return `<div class="note-item ${openId===n.id?'open':''} ${sel?'selected':''}" data-id="${n.id}">
        <input type="checkbox" class="note-check" data-check="${n.id}" ${sel?'checked':''}>
        <div class="note-item-body" data-open="${n.id}">
          <div class="note-item-top">
            <span class="note-item-title">${esc(n.title||'Untitled note')}</span>
            ${n.archived?'<span class="note-arch-tag">archived</span>':''}
          </div>
          <span class="note-item-preview">${esc(preview)||'<em>empty</em>'}</span>
          <span class="note-item-date">${fmtDate(n.updated)}</span>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-open]').forEach(b =>
      b.onclick = () => { openId = b.dataset.open; render(); });
    el.querySelectorAll('[data-check]').forEach(cb =>
      cb.onchange = e => { e.stopPropagation();
        const id = cb.dataset.check;
        if(cb.checked) selected.add(id); else selected.delete(id);
        renderSelbar(); renderList(); });
  }

  // ===== Rich text editor (contenteditable + toolbar + markdown shortcuts) =====
  const TOOLBAR = [
    {cmd:'bold',        label:'B',  title:'Bold (Ctrl/Cmd+B)',      cls:'rte-b'},
    {cmd:'italic',      label:'I',  title:'Italic (Ctrl/Cmd+I)',    cls:'rte-i'},
    {cmd:'underline',   label:'U',  title:'Underline (Ctrl/Cmd+U)', cls:'rte-u'},
    {cmd:'insertUnorderedList', label:'•≡', title:'Bullet list'},
    {cmd:'insertOrderedList',   label:'1≡', title:'Numbered list'},
  ];

  function renderEditor(){
    const el = document.getElementById('noteEditor');
    const n = openId ? (Store.data.notes||[]).find(x => x.id === openId) : null;
    activeImg = null;
    if(!n){ el.innerHTML = `<div class="editor-empty">Select a note, or start a new one.</div>`; return; }
    const clientList = [...new Set((Store.data.cards||[]).map(c=>c.client).filter(Boolean))];
    el.innerHTML = `
      <input class="note-title-input" id="ne-title" value="${esc(n.title||'')}" placeholder="Note title">
      <div class="note-editor-meta">Created ${fmtDate(n.created)} · Updated ${fmtDate(n.updated)}</div>
      <div class="field">
        <label>Expedition / client</label>
        <input id="ne-client" value="${esc(n.client||'')}" placeholder="e.g. AcmeHealth" list="ne-clientlist">
        <datalist id="ne-clientlist">${clientList.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <div class="rte-toolbar" id="ne-toolbar">
        ${TOOLBAR.map(b => `<button type="button" class="rte-btn ${b.cls||''}" data-cmd="${b.cmd}" title="${b.title}">${b.label}</button>`).join('')}
        <span class="rte-sep"></span>
        <span class="rte-img-controls" id="ne-img-controls" hidden>
          <span class="rte-img-label">Image:</span>
          <button type="button" class="rte-btn sm" data-imgsize="s">S</button>
          <button type="button" class="rte-btn sm" data-imgsize="m">M</button>
          <button type="button" class="rte-btn sm" data-imgsize="l">L</button>
          <button type="button" class="rte-btn sm" data-imgsize="full">Full</button>
        </span>
        <span class="rte-hint">or type <code>**bold**</code>, <code>*italic*</code>, <code>-</code> or <code>1.</code> for lists · paste an image with Ctrl/Cmd+V</span>
      </div>
      <div class="note-body-input" id="ne-body" contenteditable="true" data-placeholder="Write freely…">${n.body||''}</div>
      <div class="note-editor-actions">
        <button class="btn-ghost" id="ne-archive">${n.archived?'Unarchive':'Archive'}</button>
        <button class="btn-ghost" id="ne-export">Export for Claude</button>
        <button class="btn-ghost danger" id="ne-delete">Delete</button>
        <span class="save-state" id="ne-saved">Saved</span>
      </div>`;
    const title = document.getElementById('ne-title');
    const body = document.getElementById('ne-body');
    const client = document.getElementById('ne-client');
    const saved = document.getElementById('ne-saved');
    let timer;
    const autosave = () => {
      saved.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(() => {
        n.title = title.value; n.body = body.innerHTML; n.updated = Date.now();
        n.client = client.value.trim();
        Store.persist(); renderList(); saved.textContent = 'Saved';
      }, 500);
    };
    title.oninput = autosave; client.oninput = autosave;
    body.oninput = () => { handleMarkdownShortcuts(body); autosave(); };
    body.onpaste = e => handleImagePaste(e, body, autosave);
    body.onkeydown = e => {
      const mod = e.ctrlKey || e.metaKey;
      if(mod && e.key.toLowerCase()==='b'){ e.preventDefault(); document.execCommand('bold'); autosave(); }
      else if(mod && e.key.toLowerCase()==='i'){ e.preventDefault(); document.execCommand('italic'); autosave(); }
      else if(mod && e.key.toLowerCase()==='u'){ e.preventDefault(); document.execCommand('underline'); autosave(); }
    };
    body.onclick = e => {
      const img = e.target.closest('img.note-img');
      selectImage(img || null, body);
    };
    document.getElementById('ne-toolbar').querySelectorAll('[data-cmd]').forEach(btn =>
      btn.onclick = () => { body.focus(); document.execCommand(btn.dataset.cmd); autosave(); });
    document.getElementById('ne-img-controls').querySelectorAll('[data-imgsize]').forEach(btn =>
      btn.onclick = () => { if(activeImg){ applyImageSize(activeImg, btn.dataset.imgsize); autosave(); } });
    document.getElementById('ne-archive').onclick = () => { n.archived = !n.archived; n.updated = Date.now(); Store.persist(); render(); Toast.show(n.archived?'Archived':'Unarchived'); };
    document.getElementById('ne-export').onclick = () => exportNotes([n]);
    document.getElementById('ne-delete').onclick = () => {
      if(confirm('Delete this note? This cannot be undone.')){
        Store.data.notes = Store.data.notes.filter(x => x.id !== n.id);
        selected.delete(n.id); openId = null; Store.persist(); render(); Toast.show('Note deleted');
      }
    };
  }

  // Converts trailing markdown-style shortcuts into formatting as the user types.
  // Supported: **bold**, *italic*, "- " / "* " at line start -> bullet list,
  // "1. " at line start -> numbered list.
  function handleMarkdownShortcuts(el){
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const node = sel.anchorNode;
    if(!node || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    const caret = sel.anchorOffset;
    const before = text.slice(0, caret);

    // Bold: **word** just closed
    let m = before.match(/\*\*([^*]+)\*\*$/);
    if(m){ wrapAndReplace(node, caret, m[0], m[1], 'bold'); return; }
    // Italic: *word* just closed (avoid matching the bold pattern's leftover)
    m = before.match(/(?<!\*)\*([^*]+)\*(?!\*)$/);
    if(m){ wrapAndReplace(node, caret, m[0], m[1], 'italic'); return; }

    // Line-start list shortcuts: "- ", "* ", "1. " typed at start of a line.
    // "Start of line" = nothing but whitespace between here and the previous
    // newline (a <br>/block boundary) or the start of this text node's block —
    // not just the start of the text node itself, so it fires correctly even
    // when contenteditable has merged prior content into the same node.
    const marker = before.match(/([-*]|\d+\.)\s$/);
    if(marker){
      const lineStart = before.lastIndexOf('\n') + 1;
      const linePrefix = before.slice(lineStart, before.length - marker[0].length);
      if(linePrefix.trim() === ''){
        const ordered = /^\d+\.\s$/.test(marker[0]);
        const range = document.createRange();
        range.setStart(node, lineStart);
        range.setEnd(node, caret);
        range.deleteContents();
        document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
      }
    }
  }
  function wrapAndReplace(node, caret, fullMatch, innerText, tag){
    const start = caret - fullMatch.length;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, caret);
    range.deleteContents();
    const wrapper = document.createElement(tag==='bold'?'strong':'em');
    wrapper.textContent = innerText;
    range.insertNode(wrapper);
    // place caret after the inserted node, followed by a space so typing continues normally
    const space = document.createTextNode('\u200B');
    wrapper.after(space);
    const sel = window.getSelection();
    const newRange = document.createRange();
    newRange.setStart(space, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  // ---- image paste: intercept, downscale, insert ----
  function handleImagePaste(e, body, autosave){
    const items = (e.clipboardData || {}).items || [];
    let imgItem = null;
    for(const it of items){ if(it.type && it.type.startsWith('image/')){ imgItem = it; break; } }
    if(!imgItem) return; // let default text/HTML paste happen
    e.preventDefault();
    const file = imgItem.getAsFile();
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const srcImg = new Image();
      srcImg.onload = () => {
        const scale = Math.min(1, IMG_MAX_W / srcImg.width);
        const w = Math.round(srcImg.width * scale), h = Math.round(srcImg.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(srcImg, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', IMG_QUALITY);
        insertImageAtCursor(body, dataUrl, w);
        autosave();
      };
      srcImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  function insertImageAtCursor(body, dataUrl, naturalW){
    body.focus();
    const displayW = Math.min(naturalW, 500); // default inline display width
    const html = `<img class="note-img" src="${dataUrl}" width="${displayW}" style="width:${displayW}px">`;
    if(!document.execCommand('insertHTML', false, html)){
      body.insertAdjacentHTML('beforeend', html);
    }
  }

  // ---- image selection + resize UI ----
  function selectImage(img, body){
    body.querySelectorAll('img.note-img').forEach(i => i.classList.remove('sel'));
    removeResizeHandle();
    activeImg = img;
    const ctrl = document.getElementById('ne-img-controls');
    if(!ctrl) return;
    if(!img){ ctrl.hidden = true; return; }
    img.classList.add('sel');
    ctrl.hidden = false;
    attachResizeHandle(img);
  }
  function applyImageSize(img, key){
    if(key === 'full'){ img.style.width = ''; img.removeAttribute('width'); }
    else { const w = SIZE_PRESETS[key]; img.style.width = w + 'px'; img.setAttribute('width', w); }
    if(activeImg === img) attachResizeHandle(img);
  }
  function attachResizeHandle(img){
    removeResizeHandle();
    const handle = document.createElement('div');
    handle.className = 'note-img-handle';
    document.body.appendChild(handle);
    positionHandle();
    function positionHandle(){
      const r = img.getBoundingClientRect();
      handle.style.left = (r.right - 8 + window.scrollX) + 'px';
      handle.style.top = (r.bottom - 8 + window.scrollY) + 'px';
    }
    let dragging = false, startX, startW;
    handle.onmousedown = e => {
      e.preventDefault(); dragging = true;
      startX = e.clientX; startW = img.getBoundingClientRect().width;
      document.body.style.userSelect = 'none';
    };
    function onMove(e){
      if(!dragging) return;
      const newW = Math.max(60, Math.round(startW + (e.clientX - startX)));
      img.style.width = newW + 'px'; img.setAttribute('width', newW);
      positionHandle();
    }
    function onUp(){
      if(dragging){ dragging = false; document.body.style.userSelect = '';
        const b = document.getElementById('ne-body');
        if(b) b.dispatchEvent(new Event('input')); }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    handle._cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    handle._reposition = positionHandle;
    window.addEventListener('scroll', positionHandle, true);
  }
  function removeResizeHandle(){
    document.querySelectorAll('.note-img-handle').forEach(h => {
      h._cleanup && h._cleanup();
      if(h._reposition) window.removeEventListener('scroll', h._reposition, true);
      h.remove();
    });
  }

  function renderSelbar(){
    const bar = document.getElementById('notesSelbar');
    bar.hidden = selected.size === 0;
    document.getElementById('notesSelCount').textContent = `${selected.size} selected`;
    // If every selected note is archived, the action should be Unarchive
    const sel = (Store.data.notes||[]).filter(n => selected.has(n.id));
    const allArchived = sel.length > 0 && sel.every(n => n.archived);
    const btn = document.getElementById('selArchive');
    btn.textContent = allArchived ? 'Unarchive' : 'Archive';
    btn.dataset.mode = allArchived ? 'unarchive' : 'archive';
  }

  function newNote(){
    const n = { id: Store.uid(), title:'', body:'', created: Date.now(), updated: Date.now(), archived:false, client:'' };
    (Store.data.notes ||= []).unshift(n);
    openId = n.id; Store.persist(); render();
    setTimeout(()=> document.getElementById('ne-title')?.focus(), 60);
  }

  // Strips HTML down to readable plain text (used for search, previews, and export).
  function bodyText(html){
    if(!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('img').forEach(img => img.replaceWith(document.createTextNode('[image] ')));
    // add line breaks for list items so text doesn't run together
    tmp.querySelectorAll('li').forEach(li => li.append('\n'));
    return (tmp.textContent || '').replace(/\u200B/g,'').trim();
  }

  // ===== Export: Claude-friendly plain text =====
  function exportNotes(notes){
    if(!notes.length){ Toast.show('No notes selected'); return; }
    const sorted = notes.slice().sort((a,b)=>(a.created||0)-(b.created||0));
    const range = dateRange(sorted);
    let out = `# Field Notes export\n`;
    out += `Range: ${range}\n`;
    out += `Count: ${sorted.length} note${sorted.length>1?'s':''}\n`;
    out += `\nPlease read the notes below and summarize them into clearer, more cohesive thoughts. `;
    out += `Group related ideas, surface any themes or action items, and flag anything that looks unresolved.\n`;
    out += `\n---\n`;
    sorted.forEach((n,i) => {
      out += `\n## ${i+1}. ${n.title || 'Untitled'}\n`;
      out += `_${fmtDate(n.created)}${n.archived?' · archived':''}${n.client?' · '+n.client:''}_\n\n`;
      out += `${bodyText(n.body) || '(empty)'}\n`;
    });
    download(`field-notes-${stamp()}.txt`, out, 'text/plain');
    Toast.show(`Exported ${sorted.length} note${sorted.length>1?'s':''}`);
  }

  function bulkArchive(){
    const ids = [...selected];
    const unarch = document.getElementById('selArchive').dataset.mode === 'unarchive';
    Store.data.notes.forEach(n => { if(ids.includes(n.id)){ n.archived = !unarch; n.updated = Date.now(); } });
    Store.persist(); selected.clear(); render();
    Toast.show(`${unarch?'Unarchived':'Archived'} ${ids.length}`);
  }
  function bulkDelete(){
    const ids = [...selected];
    if(!confirm(`Delete ${ids.length} note${ids.length>1?'s':''}? This cannot be undone.`)) return;
    Store.data.notes = Store.data.notes.filter(n => !ids.includes(n.id));
    if(ids.includes(openId)) openId = null;
    Store.persist(); selected.clear(); render(); Toast.show(`Deleted ${ids.length}`);
  }
  function bulkExport(){
    const notes = Store.data.notes.filter(n => selected.has(n.id));
    exportNotes(notes);
  }

  // helpers
  function dateRange(sorted){
    if(!sorted.length) return '—';
    const a = fmtDate(sorted[0].created), b = fmtDate(sorted[sorted.length-1].created);
    return a === b ? a : `${a} – ${b}`;
  }
  function fmtDate(ts){ if(!ts) return ''; return new Date(ts).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
  function stamp(){ return new Date().toISOString().slice(0,10); }
  function download(name, text, type){
    const b = new Blob([text], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  }

  function init(){
    document.getElementById('addNoteBtn').onclick = newNote;
    document.getElementById('noteSearch').oninput = e => { query = e.target.value; renderList(); };
    document.querySelectorAll('#tab-notes [data-view]').forEach(b =>
      b.onclick = () => {
        view = b.dataset.view;
        document.querySelectorAll('#tab-notes [data-view]').forEach(x => x.classList.toggle('active', x===b));
        renderList();
      });
    document.getElementById('selArchive').onclick = bulkArchive;
    document.getElementById('selDelete').onclick = bulkDelete;
    document.getElementById('selExport').onclick = bulkExport;
    document.getElementById('selClear').onclick = () => { selected.clear(); render(); };
    document.addEventListener('click', e => {
      const body = document.getElementById('ne-body');
      if(body && !body.contains(e.target) && !e.target.closest('.note-img-handle') && !e.target.closest('#ne-img-controls')){
        selectImage(null, body);
      }
    });
  }

  function openById(id){
    const n = (Store.data.notes||[]).find(x => x.id === id);
    if(!n) { Toast.show('That note no longer exists'); return; }
    if(n.archived) view = 'all';   // ensure it's visible
    openId = id; render();
  }

  // ===== Expedition linkage helper (used by Expeditions view) =====
  // A note belongs to a client only via its direct n.client field.
  function notesForClient(client){
    return (Store.data.notes || []).filter(n => (n.client||'').trim() === client);
  }

  return { render, init, openById, notesForClient };
})();
