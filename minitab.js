document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  await loadGroups();
  setupEventListeners();
});

async function initTheme() {
  const { theme = 'auto' } = await chrome.storage.local.get('theme');
  document.body.classList.add(theme);
  const select = document.getElementById('theme-select');
  select.value = theme;
  select.addEventListener('change', async (e) => {
    document.body.className = '';
    document.body.classList.add(e.target.value);
    await chrome.storage.local.set({ theme: e.target.value });
  });
}

async function loadGroups(filter = '') {
  const { groups = [] } = await chrome.storage.local.get('groups');
  // Show most recent first
  groups.sort((a, b) => (b.id || 0) - (a.id || 0));
  const container = document.getElementById('groups');
  container.innerHTML = '';
  const welcome = document.getElementById('welcome');

  if (groups.length === 0) {
    welcome.style.display = 'block';
    return;
  }
  welcome.style.display = 'none';

  groups.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'group';
    groupDiv.dataset.id = group.id;
    groupDiv.setAttribute('aria-labelledby', `group-name-${group.id}`);

    const header = document.createElement('div');
    header.className = 'group-header';

    const name = document.createElement('h2');
    name.className = 'group-name';
    name.id = `group-name-${group.id}`;
    name.textContent = group.name;
    name.contentEditable = true;
    name.addEventListener('blur', updateGroupName);

    const lockBtn = document.createElement('button');
    lockBtn.textContent = group.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', toggleLock);

    const starBtn = document.createElement('button');
    starBtn.textContent = group.starred ? 'Unstar' : 'Star';
    starBtn.addEventListener('click', toggleStar);

    const restoreAll = document.createElement('button');
    restoreAll.textContent = 'Restore All';
    restoreAll.addEventListener('click', restoreGroup);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', deleteGroup);

    header.append(name, lockBtn, starBtn, restoreAll, deleteBtn);

    const ul = document.createElement('ul');
    ul.className = 'tab-list';
    ul.dataset.groupId = group.id;
    ul.setAttribute('role', 'list');
    ul.setAttribute('aria-label', `Tabs in ${group.name}`);

    group.tabs
      .filter(tab => !filter || tab.title.toLowerCase().includes(filter) || tab.url.toLowerCase().includes(filter))
      .forEach((tab, index) => {
        const li = document.createElement('li');
        li.className = 'tab-item';
        li.dataset.url = tab.url;
        li.setAttribute('role', 'listitem');

        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.alt = '';
        favicon.referrerPolicy = 'no-referrer';
        try {
          const u = new URL(tab.url);
          favicon.src = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
        } catch (_) {
          favicon.src = `https://www.google.com/s2/favicons?domain=${tab.url}&sz=64`;
        }

        const a = document.createElement('a');
        a.href = tab.url;
        a.textContent = tab.title || tab.url;
        a.addEventListener('click', restoreTab);
        a.addEventListener('mousemove', (ev) => showPreview(ev, tab));
        a.addEventListener('mouseleave', hidePreview);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'tab-copy';
        copyBtn.setAttribute('aria-label', 'Copy link');
        copyBtn.title = 'Copy link to clipboard';
        copyBtn.textContent = '⎘';
        copyBtn.addEventListener('click', (e) => copyLink(e, tab.url));

        const del = document.createElement('button');
        del.className = 'tab-delete';
        del.setAttribute('aria-label', 'Delete saved tab');
        del.title = 'Remove from MiniTab';
        del.textContent = '×';
        del.addEventListener('click', (e) => deleteTab(e, group.id, index));

        li.append(favicon, a, copyBtn, del);
        ul.append(li);
      });

    groupDiv.append(header, ul);
    container.append(groupDiv);

    // Drag-and-drop removed per requirements
  });
}

// Drag-and-drop code removed

async function restoreTab(e) {
  e.preventDefault();
  const url = e.target.href;
  await chrome.tabs.create({ url });
}

async function restoreGroup(e) {
  const groupId = e.target.closest('.group').dataset.id;
  const { groups } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (group) {
    for (const tab of group.tabs) {
      await chrome.tabs.create({ url: tab.url });
    }
  }
}

async function deleteGroup(e) {
  if (!confirm('Delete this session?')) return;
  const groupId = e.target.closest('.group').dataset.id;
  const { groups } = await chrome.storage.local.get('groups');
  const updatedGroups = groups.filter(g => g.id != groupId);
  await chrome.storage.local.set({ groups: updatedGroups });
  await loadGroups(document.getElementById('search').value.toLowerCase());
}

async function toggleLock(e) {
  const groupId = e.target.closest('.group').dataset.id;
  const { groups } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (group) {
    group.locked = !group.locked;
    await chrome.storage.local.set({ groups });
    await loadGroups(document.getElementById('search').value.toLowerCase());
  }
}

async function toggleStar(e) {
  const groupId = e.target.closest('.group').dataset.id;
  const { groups } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (group) {
    group.starred = !group.starred;
    await chrome.storage.local.set({ groups });
    await loadGroups(document.getElementById('search').value.toLowerCase());
  }
}

async function updateGroupName(e) {
  const groupId = e.target.closest('.group').dataset.id;
  let newName = e.target.textContent.trim();
  if (!newName) {
    newName = 'Unnamed Session';
    e.target.textContent = newName;
  }
  const { groups } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (group) {
    group.name = newName;
    await chrome.storage.local.set({ groups });
  }
}

function setupEventListeners() {
  document.getElementById('search').addEventListener('input', (e) => {
    loadGroups(e.target.value.toLowerCase());
  });

  document.getElementById('export').addEventListener('click', async () => {
    const { groups = [] } = await chrome.storage.local.get('groups');
    const text = groups.map(g => `${g.name}\n${g.tabs.map(t => t.url).join('\n')}`).join('\n\n');
    download('minitab-export.txt', text);
  });

  document.getElementById('import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const newGroups = parseImportText(text);
      const { groups = [] } = await chrome.storage.local.get('groups');
      groups.push(...newGroups);
      await chrome.storage.local.set({ groups });
      await loadGroups();
    };
    reader.readAsText(file);
  });

  document.getElementById('share').addEventListener('click', async () => {
    const { groups = [] } = await chrome.storage.local.get('groups');
    const html = buildShareHtml(groups);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    await chrome.tabs.create({ url });
  });

  document.getElementById('settings').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'block';
  });

  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'none';
  });
}

function download(filename, text) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function parseImportText(text) {
  const sections = text.split('\n\n');
  return sections.map((section, index) => {
    const lines = section.split('\n');
    const name = lines[0] || `Imported Session ${index + 1}`;
    const tabs = lines.slice(1).filter(url => url.trim()).map(url => ({ title: url, url }));
    return { id: Date.now() + index, name, tabs, locked: false, starred: false };
  });
}

// Hover preview implementation (non-screenshot fallback)
let previewEl;
function showPreview(ev, tab) {
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.className = 'preview-card';
    document.body.appendChild(previewEl);
  }
  const url = tab.url;
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch (_) {}
  const fav = (() => {
    try { const u = new URL(url); return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`; } catch (_) { return `https://www.google.com/s2/favicons?domain=${url}&sz=64`; }
  })();
  previewEl.innerHTML = `
    <div class="preview-row">
      <img class="preview-favicon" src="${fav}" alt="">
      <div>
        <div class="preview-title">${escapeHtml(tab.title || url)}</div>
        <div class="preview-domain">${hostname}</div>
      </div>
    </div>
  `;
  const pad = 16;
  const x = Math.min(window.innerWidth - previewEl.offsetWidth - pad, ev.clientX + 18);
  const y = Math.min(window.innerHeight - previewEl.offsetHeight - pad, ev.clientY + 18);
  previewEl.style.left = `${Math.max(pad, x)}px`;
  previewEl.style.top = `${Math.max(pad, y)}px`;
}

async function deleteTab(e, groupId, tabIndex) {
  e.stopPropagation();
  e.preventDefault();
  const { groups = [] } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (!group) return;
  group.tabs.splice(tabIndex, 1);
  await chrome.storage.local.set({ groups });
  await loadGroups(document.getElementById('search').value.toLowerCase());
}

function hidePreview() {
  if (previewEl && previewEl.parentNode) {
    previewEl.parentNode.removeChild(previewEl);
    previewEl = null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function copyLink(e, url) {
  e.stopPropagation();
  e.preventDefault();
  try {
    await navigator.clipboard.writeText(url);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }
}

function buildShareHtml(groups) {
  const totalLinks = groups.reduce((sum, g) => sum + (g.tabs?.length || 0), 0);
  const head = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MiniTab Share (${totalLinks} link${totalLinks===1?'':'s'})</title><style>
  body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;line-height:1.5}
  h1{margin:0 0 16px 0;font-size:22px}
  h2{margin:20px 0 8px 0;font-size:18px}
  .meta{color:#666;font-size:13px;margin-bottom:16px}
  ul{list-style:none;padding:0;margin:0 0 20px 0}
  li{display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #eee}
  li:last-child{border-bottom:none}
  a{color:#0a5; text-decoration:none}
  a:hover{text-decoration:underline}
  .fav{width:16px;height:16px;border-radius:2px;margin-right:8px}
  @media (prefers-color-scheme: dark){body{background:#121212;color:#fff}.meta{color:#aaa}li{border-bottom:1px solid #333}}
  </style></head><body>`;
  const header = `<h1>MiniTab Share</h1><div class="meta">${groups.length} session${groups.length===1?'':'s'} • ${totalLinks} link${totalLinks===1?'':'s'}</div>`;
  const body = groups.map(g => {
    const safeName = escapeHtml(g.name || 'Session');
    const items = (g.tabs || []).map(t => {
      const url = t.url || '';
      const safeUrl = escapeHtml(url);
      const safeTitle = escapeHtml(t.title || url);
      let host = '';
      try { host = new URL(url).hostname; } catch(_) {}
      const fav = (()=>{try{const u=new URL(url);return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;}catch(_){return `https://www.google.com/s2/favicons?domain=${safeUrl}&sz=64`;}})();
      return `<li><img class="fav" src="${fav}" alt=""><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">${safeTitle}</a></li>`;
    }).join('');
    return `<section><h2>${safeName}</h2><ul>${items}</ul></section>`;
  }).join('');
  const foot = `</body></html>`;
  return head + header + body + foot;
}
