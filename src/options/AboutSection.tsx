import { useEffect, useState } from 'react';
import type { SettingsApi } from '../ui/use-settings';
import { defaultSettings } from '../storage/settings.schema';

export function ShortcutsSection() {
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    void chrome.commands.getAll().then((cmds) => {
      setShortcut(cmds.find((c) => c.name === 'toggle-dark-mode')?.shortcut || '');
    });
  }, []);

  return (
    <section className="panel" id="shortcuts" aria-labelledby="shortcuts-h">
      <h2 id="shortcuts-h">Keyboard shortcut</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          Toggle dark mode for the current site:{' '}
          {shortcut === null ? '…' : shortcut ? <kbd>{shortcut}</kbd> : <em>not set</em>}
        </p>
        <p className="hint">
          Chrome manages extension shortcuts. Use the button to change or clear it. The shortcut works on the page you are
          viewing even before you have granted the site permanent access.
        </p>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change shortcut in Chrome
          </button>
        </div>
      </div>
    </section>
  );
}

export function PrivacySection({ update }: Pick<SettingsApi, 'update'>) {
  return (
    <section className="panel" id="privacy" aria-labelledby="privacy-h">
      <h2 id="privacy-h">Privacy</h2>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Everything runs on your device. There is no account, no analytics and no tracking.</li>
          <li>No remote code is downloaded. The only network request the extension makes is fetching a website’s own stylesheet when the page itself can’t expose it.</li>
          <li>Your settings are stored in Chrome’s local extension storage and never leave your browser.</li>
          <li>
            Limits: pages Chrome protects (chrome:// pages, the Chrome Web Store, PDF viewer), closed shadow DOM,
            canvas/WebGL content and cross-origin frames you haven’t granted can’t be changed.
          </li>
        </ul>
        <div className="actions">
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm('Reset every setting, including all website settings?')) void update((s) => Object.assign(s, defaultSettings()));
            }}
          >
            Reset all settings
          </button>
        </div>
      </div>
    </section>
  );
}
