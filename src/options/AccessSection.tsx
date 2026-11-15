import { useCallback, useEffect, useState } from 'react';

const isAllSites = (o: string): boolean => o === '<all_urls>' || o === '*://*/*';

const label = (origin: string): string => (isAllSites(origin) ? 'All websites' : origin.replace(/\/\*$/, ''));

/** Shows which sites the extension can read and lets the user revoke each grant. */
export function AccessSection() {
  const [origins, setOrigins] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { origins: granted } = await chrome.permissions.getAll();
    setOrigins((granted ?? []).filter((o) => /^(https?|file|\*):\/\//.test(o) || o === '<all_urls>'));
  }, []);

  useEffect(() => {
    void refresh();
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => {
      chrome.permissions.onAdded.removeListener(refresh);
      chrome.permissions.onRemoved.removeListener(refresh);
    };
  }, [refresh]);

  const revoke = async (origin: string) => {
    const ok = await chrome.permissions.remove({ origins: [origin] });
    setMessage(ok ? `Access to ${label(origin)} removed.` : 'Chrome did not remove that permission.');
    await refresh();
  };

  const grantAll = async () => {
    const ok = await chrome.permissions.request({ origins: ['<all_urls>'] });
    setMessage(ok ? 'Dark mode can now run automatically on every website.' : 'Access was not granted.');
    await refresh();
  };

  const hasAll = origins?.some(isAllSites) ?? false;

  return (
    <section className="panel" id="access" aria-labelledby="access-h">
      <h2 id="access-h">Site access</h2>
      <p className="hint">
        Chrome only lets an extension change a website after you grant access to it. Enabling dark mode on a site from the
        popup grants that one site. You can also allow every site so dark mode applies automatically everywhere; that lets
        the extension read and change pages you visit, entirely on your device.
      </p>
      <div className="card">
        <ul className="list" aria-label="Sites with granted access">
          {origins?.length === 0 && <li className="meta">No sites granted yet.</li>}
          {origins?.map((o) => (
            <li key={o}>
              <strong>{label(o)}</strong>
              <button type="button" className="btn danger" aria-label={`Revoke access to ${label(o)}`} onClick={() => void revoke(o)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
        {!hasAll && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => void grantAll()}>
              Allow all websites
            </button>
          </div>
        )}
        <p role="status" className="hint">
          {message}
        </p>
      </div>
    </section>
  );
}
