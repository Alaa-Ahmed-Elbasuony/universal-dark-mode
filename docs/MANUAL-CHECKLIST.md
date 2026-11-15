# Manual verification checklist (installed Chrome)

Automated tests run in Playwright's Chromium with a test-only manifest. These steps cover what automation cannot: Chrome's real permission prompt, dynamic script registration and your own browser profile. Build first: `npm run build`, then load `dist/` unpacked.

## Install and onboarding
- [ ] Extension loads with no errors on `chrome://extensions` (no "Errors" button).
- [ ] The settings page opens once on first install.
- [ ] `chrome://extensions` shows **no** site access ("Site access: On click" / none) right after install.

## Per-site activation (the permission flow)
- [ ] On an `https` site, open the popup: site name shown, switch is off.
- [ ] Turn the switch on: Chrome shows a permission prompt for **that site only**. Allow.
- [ ] The page turns dark immediately, no reload needed.
- [ ] Reload and navigate within the site: it stays dark from the first paint (no white flash beyond a frame).
- [ ] Open a different site: **not** dark (no access, nothing runs).
- [ ] Switch off in the popup: the page returns to its original look at once.
- [ ] Options > Site access lists the site; **Revoke** removes it; reloading the site is no longer dark.

## Behavior
- [ ] Theme, brightness and contrast changes apply live.
- [ ] "Follow system appearance": toggle your OS light/dark and the page follows.
- [ ] A site that is already dark (e.g. a dark docs site) in Automatic mode is left unchanged.
- [ ] Images, logos and videos look normal; "Dim images" dims only large photos.
- [ ] Alt+Shift+D toggles the current site (works on a site without permanent access for that visit).
- [ ] Options > Websites: add a site, exclude a selector, add a background override; effects appear on the page.

## Limits behave gracefully
- [ ] On `chrome://extensions`, the Web Store and the PDF viewer, the popup says the page cannot be changed and the switch is disabled.

## Your real sites (report any defect with a screenshot)
- [ ] Azure DevOps (Boards > Work items): left navigation, toolbar, filter bar and grid all dark, text readable.
- [ ] A few sites you use daily: no large light regions, no unreadable text, layout unchanged.
