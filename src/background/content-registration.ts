import { getGrantedOrigins } from './permission-manager';

const CONTENT_ID = 'udm-content';
const MAIN_WORLD_ID = 'udm-main-world';

/**
 * Keeps the dynamically registered document_start scripts matching exactly the origins the
 * user has granted: one site, several sites, or all sites. Two scripts: the engine (isolated
 * world) and a tiny hook in the page's MAIN world that reports CSSOM mutations. Idempotent,
 * so it's safe to call on every worker start and permission change.
 */
export async function syncContentScriptRegistration(): Promise<void> {
  const matches = await getGrantedOrigins();
  const existing = new Set(
    (await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_ID, MAIN_WORLD_ID] })).map((s) => s.id),
  );

  if (matches.length === 0) {
    const ids = [...existing];
    if (ids.length > 0) await chrome.scripting.unregisterContentScripts({ ids });
    return;
  }

  const scripts: chrome.scripting.RegisteredContentScript[] = [
    { id: CONTENT_ID, js: ['content.js'], matches, runAt: 'document_start', allFrames: true, persistAcrossSessions: true },
    {
      id: MAIN_WORLD_ID,
      js: ['main-world.js'],
      matches,
      runAt: 'document_start',
      allFrames: true,
      world: 'MAIN',
      persistAcrossSessions: true,
    },
  ];
  const toUpdate = scripts.filter((s) => existing.has(s.id));
  const toRegister = scripts.filter((s) => !existing.has(s.id));
  if (toUpdate.length) await chrome.scripting.updateContentScripts(toUpdate);
  if (toRegister.length) await chrome.scripting.registerContentScripts(toRegister);
}

/** Inject into one tab right now (used after the user enables a site, or via activeTab). */
export async function injectIntoTab(tabId: number): Promise<void> {
  const target = { tabId, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['main-world.js'], world: 'MAIN' });
  await chrome.scripting.executeScript({ target, files: ['content.js'] });
}
