/**
 * Runs in the page's MAIN world (registered with world: "MAIN"). The isolated-world engine
 * cannot see CSSOM mutations made by the page's own scripts: CSS-in-JS libraries call
 * insertRule/replaceSync, and component frameworks assign adoptedStyleSheets. This hook only
 * announces that something changed (a payload-free DOM event); the engine re-reads the CSS
 * itself. It never alters arguments or return values and must never throw into page code.
 */
const EVENT = 'udm:css-changed';
const GUARD = '__udmMainHook';

const w = window as unknown as Record<string, unknown>;
if (!w[GUARD]) {
  w[GUARD] = true;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const notify = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      try {
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* never break the page */
      }
    }, 50);
  };

  try {
    const proto = CSSStyleSheet.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ['insertRule', 'deleteRule', 'replace', 'replaceSync']) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function (this: CSSStyleSheet, ...args: unknown[]): unknown {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    }

    for (const target of [Document.prototype, ShadowRoot.prototype]) {
      const desc = Object.getOwnPropertyDescriptor(target, 'adoptedStyleSheets');
      const setter = desc?.set;
      if (!desc || !setter) continue;
      Object.defineProperty(target, 'adoptedStyleSheets', {
        ...desc,
        set(this: unknown, value: unknown) {
          setter.call(this, value);
          notify();
        },
      });
    }
  } catch {
    /* hook is best-effort */
  }
}
