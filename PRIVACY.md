# Privacy Policy: Universal Dark Mode

_Last updated: 2026-11-15_

Universal Dark Mode changes the colors of web pages **on your device**. It does not collect, transmit, sell or share personal data.

## What the extension accesses
- **Page content and styles** of websites you have allowed, only to read their colors and apply dark styling. This happens locally in your browser. Page content is never stored or sent anywhere.
- **The address (hostname) of the current tab**, to remember settings per website and to show it in the popup.

## What is stored
Your settings (theme, brightness/contrast, per-site choices, excluded elements, color overrides, custom theme) are stored in Chrome's local extension storage (`chrome.storage.local`) on your device. The extension does not sync them and has no server.

## Network activity
- No analytics, telemetry, advertising or crash reporting.
- No remote code is downloaded or executed.
- The only request the extension can make is fetching a website's own **CSS file** when the page itself prevents the extension from reading it (a cross-origin stylesheet). The request is made only to sites you have granted access to, sends no cookies or identifiers, and the result is used in memory and discarded.

## Permissions and why
| Permission | Purpose |
|---|---|
| `storage` | Save your settings locally. |
| `scripting` | Run the dark-mode script on sites you have enabled. |
| `activeTab` | Let the keyboard shortcut and toolbar button work on the current tab without a permanent grant. |
| optional site access | Requested **per site** when you turn dark mode on for it (or for all sites if you choose). You can revoke it at any time in the options page or `chrome://extensions`. |

## Your control
You can disable the extension per site or globally, revoke any site's access, and reset all settings from the options page. Uninstalling removes all stored data.

## Contact
Questions about this policy: open an issue in the project repository.
