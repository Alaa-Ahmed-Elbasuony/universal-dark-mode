import { isRestrictedUrl, siteKeyFromUrl } from '../shared/domain';
import { chromeLocalArea, StorageManager } from '../storage/storage-manager';
import { injectIntoTab, syncContentScriptRegistration } from './content-registration';
import { registerMessageRouter } from './message-router';

// Listeners must be registered synchronously at the top level of the worker.
registerMessageRouter();

const storage = new StorageManager(chromeLocalArea());

// Serialized: overlapping syncs (install + permission events) would otherwise race on
// register/unregister and throw "duplicate script ID".
let syncChain: Promise<void> = Promise.resolve();
function safeSync(): void {
  syncChain = syncChain
    .then(syncContentScriptRegistration)
    .catch((err) => console.error('[UDM] registration sync failed', err));
}

chrome.runtime.onInstalled.addListener(async (details) => {
  // load() runs migrations; save() persists the normalized result.
  await storage.save(await storage.load());
  safeSync();
  if (details.reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(safeSync);
chrome.permissions.onAdded.addListener(safeSync);
chrome.permissions.onRemoved.addListener(safeSync);

/**
 * Keyboard shortcut: toggle dark mode for the current site. Invoking a command grants
 * activeTab for that tab, so it works even before the site has permanent access (the page is
 * then darkened for this visit; permanent access comes from enabling the site in the popup).
 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-dark-mode' || !tab?.id || !tab.url || isRestrictedUrl(tab.url)) return;
  const siteKey = siteKeyFromUrl(tab.url);
  if (!siteKey) return;
  try {
    const current = await storage.load();
    const site = current.sites[siteKey];
    const isOn = current.global.enabled && (site?.mode ?? current.global.defaultMode) !== 'disabled';
    await storage.update((s) => {
      s.sites[siteKey] = { ...s.sites[siteKey], mode: isOn ? 'disabled' : 'forced' };
      if (!isOn) s.global.enabled = true;
    });
    if (!isOn) await injectIntoTab(tab.id);
  } catch (err) {
    console.error('[UDM] shortcut toggle failed', err);
  }
});
