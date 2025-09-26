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
        li.setAttribute('draggable', 'true');

        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '☰';
        dragHandle.setAttribute('aria-hidden', 'true');

        const a = document.createElement('a');
        a.href = tab.url;
        a.textContent = tab.title || tab.url;
        a.addEventListener('click', restoreTab);

        li.append(dragHandle, a);
        ul.append(li);
      });

    groupDiv.append(header, ul);
    container.append(groupDiv);

    if (!group.locked) {
      makeSortable(ul);
    }
  });
}

function makeSortable(list) {
  list.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.tab-item');
    if (item) {
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (_) {}
    }
  });

  list.addEventListener('dragend', (e) => {
    const item = e.target.closest('.tab-item');
    if (item) {
      item.classList.remove('dragging');
      saveOrder(list.dataset.groupId);
    }
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = list.querySelector('.dragging');
    if (!dragging) return;
    const afterElement = getDragAfterElement(list, e.clientY);
    if (afterElement === null) {
      list.appendChild(dragging);
    } else {
      list.insertBefore(dragging, afterElement);
    }
  });
}

function getDragAfterElement(list, y) {
  const draggableElements = [...list.querySelectorAll('.tab-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveOrder(groupId) {
  const { groups } = await chrome.storage.local.get('groups');
  const group = groups.find(g => g.id == groupId);
  if (group) {
    const newTabs = Array.from(document.querySelector(`.tab-list[data-group-id="${groupId}"] .tab-item`))
      .map(li => ({
        title: li.querySelector('a').textContent,
        url: li.dataset.url
      }));
    group.tabs = newTabs;
    await chrome.storage.local.set({ groups });
  }
}

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
