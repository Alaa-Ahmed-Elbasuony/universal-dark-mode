# Chrome Web Store listing

## Name
Universal Dark Mode

## Summary (max 132 characters)
Turns light websites into natural-looking dark interfaces. Works locally, no account, no tracking.

## Single purpose
Apply a dark color scheme to web pages the user chooses, preserving images, logos and brand colors.

## Detailed description
Universal Dark Mode makes the websites you use comfortable at night without wrecking them. Instead of inverting everything, it recolors a page's surfaces, text and borders by role, keeping the page's hierarchy, your photos, logos, video and brand colors exactly as designed.

**Per-site and private.** Dark mode runs only on sites you turn it on for (or everywhere, if you choose). Everything happens on your device: no account, no tracking, no remote code.

**Made to look right.**
- Four themes: Midnight, OLED, Nord and Warm, plus a custom theme with automatic contrast protection
- Brightness and contrast controls, optional image dimming
- Works with modern sites: dynamic pages, single-page apps, shadow DOM, CSS variables, hover and focus states
- Follow your system's light/dark setting
- Exclude any element with a CSS selector, or set your own background colors per site
- Keyboard shortcut (Alt+Shift+D)

**Always reversible.** Turn it off and the page returns exactly to its original look.

Not supported: Chrome's own pages, the Chrome Web Store, and the built-in PDF viewer (Chrome does not allow extensions there).

## Permission justifications
- **storage**: saves the user's settings locally.
- **scripting**: injects the dark-mode script into sites the user enabled.
- **activeTab**: lets the toolbar button and keyboard shortcut act on the current tab.
- **optional host access (`<all_urls>`)**: requested per site at the moment the user enables dark mode for it, or for all sites if they opt in. Needed to read and recolor page styles. Never requested at install; revocable at any time.

## Data usage disclosures
- Does not collect or transmit user data. No analytics. No remote code.
- Privacy policy: see PRIVACY.md (publish its text at a public URL for the listing).

## Assets (in `store-assets/`, from `npm run assets`)
- `screenshot-1-before-after.png`, `screenshot-2-themes.png`, `screenshot-3-controls.png` (1280x800)
- `promo-small-440x280.png`
- Icon: `public/icons/icon128.png`
- A 1400x560 marquee tile is optional and not generated.
