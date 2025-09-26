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

  // Ensure MiniTab opens in the SAME window
  const currentWindowId = tabs[0] ? tabs[0].windowId : undefined;
  const url = chrome.runtime.getURL('minitab.html');
  let targetTab;
  if (currentWindowId != null) {
    const existingInWindow = await chrome.tabs.query({ windowId: currentWindowId, url });
    if (existingInWindow.length > 0) {
      targetTab = existingInWindow[0];
    } else {
      targetTab = await chrome.tabs.create({ windowId: currentWindowId, url, active: true });
    }
    if (targetTab && targetTab.id != null) {
      await chrome.tabs.update(targetTab.id, { active: true });
    }
    await chrome.windows.update(currentWindowId, { focused: true });
  } else {
    // Fallback if we somehow can't detect the window
    targetTab = await chrome.tabs.create({ url, active: true });
    if (targetTab && targetTab.windowId != null) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }
  }

  // Close collected tabs AFTER opening MiniTab, so the window remains
  const tabIds = tabs.map(tab => tab.id).filter(id => id !== undefined);
  if (tabIds.length) {
    await chrome.tabs.remove(tabIds);
  }
}
