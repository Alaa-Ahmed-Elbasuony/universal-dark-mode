import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useSettings } from '../ui/use-settings';
import { AccessSection } from './AccessSection';
import { PrivacySection, ShortcutsSection } from './AboutSection';
import { CustomThemeSection } from './CustomThemeSection';
import { GeneralSection } from './GeneralSection';
import { SitesSection } from './SitesSection';
import './options.css';

const NAV = [
  ['general', 'General'],
  ['custom-theme', 'Custom theme'],
  ['sites', 'Websites'],
  ['access', 'Site access'],
  ['shortcuts', 'Shortcut'],
  ['privacy', 'Privacy'],
] as const;

function Options() {
  const { settings, update, error, clearError } = useSettings();

  return (
    <div className="page">
      <nav className="sidebar" aria-label="Settings sections">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span>Universal Dark Mode</span>
        </div>
        {NAV.map(([id, text]) => (
          <a key={id} href={`#${id}`}>
            {text}
          </a>
        ))}
      </nav>
      <main aria-busy={!settings}>
        <h1>Settings</h1>
        {!settings && !error && <p className="hint">Loading…</p>}
        {error && (
          <p className="error" role="alert">
            {error}{' '}
            <button type="button" className="link" onClick={clearError}>
              Dismiss
            </button>
          </p>
        )}
        <GeneralSection settings={settings} update={update} />
        <CustomThemeSection settings={settings} update={update} />
        <SitesSection settings={settings} update={update} />
        <AccessSection />
        <ShortcutsSection />
        <PrivacySection update={update} />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
