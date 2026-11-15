export const ALL_SITES = { origins: ['<all_urls>'] } as const;

export async function hasAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [...ALL_SITES.origins] });
}

/** Match patterns usable by content scripts (http/https/file/all_urls). */
export function isContentScriptPattern(p: string): boolean {
  return p === '<all_urls>' || /^(\*|https?|file):\/\//.test(p);
}

/** Origins the user has granted so far (one per site, or <all_urls>). */
export async function getGrantedOrigins(): Promise<string[]> {
  const { origins } = await chrome.permissions.getAll();
  return (origins ?? []).filter(isContentScriptPattern);
}
