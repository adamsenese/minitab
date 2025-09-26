chrome.action.onClicked.addListener(async () => {
  await collectTabs();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'collect-tabs') {
    await collectTabs();
  }
});

async function collectTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tabData = tabs
    .filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
    .map(tab => ({ title: tab.title, url: tab.url }));

  if (tabData.length === 0) return;

  const { groups = [] } = await chrome.storage.local.get('groups');
  const now = new Date();
  const ts = now.toLocaleString();
  const count = tabData.length;
  const newGroup = {
    id: Date.now(),
    name: `${ts} • ${count} tab${count === 1 ? '' : 's'}`,
    tabs: tabData,
    locked: false,
    starred: false
  };
  groups.push(newGroup);
  await chrome.storage.local.set({ groups });

  // Close collected tabs
  const tabIds = tabs.map(tab => tab.id).filter(id => id !== undefined);
  if (tabIds.length) {
    await chrome.tabs.remove(tabIds);
  }

  // Open or focus MiniTab page
  const url = chrome.runtime.getURL('minitab.html');
  const existingTabs = await chrome.tabs.query({ url });
  if (existingTabs.length > 0) {
    if (existingTabs[0].id != null) {
      await chrome.tabs.update(existingTabs[0].id, { active: true });
      await chrome.windows.update(existingTabs[0].windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
}
