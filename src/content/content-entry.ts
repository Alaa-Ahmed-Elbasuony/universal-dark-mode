import { Runtime } from './runtime';

const GUARD = '__udmContentLoaded';

// Guard against double injection (registered script + activeTab executeScript).
const w = window as unknown as Record<string, unknown>;
if (!w[GUARD]) {
  w[GUARD] = true;
  new Runtime().start().catch((err) => console.error('[UDM] runtime failed to start', err));
}
