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
      .forEach(tab => {
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

        li.append(favicon, a);
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
    const html = `<!DOCTYPE html><html><body>${groups.map(g => `<h2>${g.name}</h2><ul>${g.tabs.map(t => `<li><a href=\"${t.url}\">${t.title || t.url}</a></li>`).join('')}</ul>`).join('')}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
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
