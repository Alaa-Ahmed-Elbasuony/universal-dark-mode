/** The Navigation API is not in every TS lib version; only what we use is declared. */
interface NavigationLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Detects client-side (SPA) navigations, where the document stays alive but its content is
 * replaced. Uses the Navigation API where available, plus popstate/hashchange as fallbacks.
 * `onNavigate` is debounced so a burst of route changes triggers a single re-examination.
 */
export function watchNavigation(onNavigate: () => void, delayMs = 150): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onNavigate();
    }, delayMs);
  };
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  nav?.addEventListener('navigatesuccess', fire);
  window.addEventListener('popstate', fire);
  window.addEventListener('hashchange', fire);
  return () => {
    if (timer) clearTimeout(timer);
    nav?.removeEventListener('navigatesuccess', fire);
    window.removeEventListener('popstate', fire);
    window.removeEventListener('hashchange', fire);
  };
}
