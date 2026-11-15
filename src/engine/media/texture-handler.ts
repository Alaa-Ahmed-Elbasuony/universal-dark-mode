/**
 * Light "texture" backgrounds. Older sites paint their white page column, title bars and
 * panels with small flat images (`background: url(holder.gif) repeat-y`). There is no color to
 * remap, so the image keeps painting light over our dark surface.
 *
 * Such an image is sampled once (same-origin or data images only; anything that taints the
 * canvas is left alone). Only opaque, light, low-contrast, low-chroma images qualify, which
 * excludes photos, icons and sprites. A qualifying image is darkened with
 * `background-blend-mode: multiply` against a dark background color, which keeps its shading
 * (borders, shadows, gradients) instead of replacing it.
 */
export type TextureClass = 'light' | 'other';

const MAX_PIXELS = 4_000_000;
const SAMPLE = 32;
const MIN_MEAN = 0.78;
const MAX_STD = 0.1;
const MAX_CHROMA = 0.1;

const cache = new Map<string, TextureClass | Promise<TextureClass>>();

/** The URL of a single-layer `url()` background, or null (multi-layer, gradients, none). */
export function singleImageUrl(backgroundImage: string): string | null {
  if (!backgroundImage.startsWith('url(') || backgroundImage.includes('), url(') || backgroundImage.includes('gradient(')) {
    return null;
  }
  const m = /^url\((["']?)([\s\S]*)\1\)$/.exec(backgroundImage.trim());
  return m ? m[2]! : null;
}

/** Cached verdict, or undefined if the image has not been analyzed yet. */
export function cachedTexture(url: string): TextureClass | undefined {
  const hit = cache.get(url);
  return typeof hit === 'string' ? hit : undefined;
}

export function analyzeTexture(url: string, doc: Document): Promise<TextureClass> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const p = measure(url, doc).then(
    (c) => {
      cache.set(url, c);
      return c;
    },
    () => {
      cache.set(url, 'other');
      return 'other' as const;
    },
  );
  cache.set(url, p);
  return p;
}

async function measure(url: string, doc: Document): Promise<TextureClass> {
  const view = doc.defaultView;
  if (!view) return 'other';
  const img = new view.Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0 || w * h > MAX_PIXELS) return 'other';
  const canvas = doc.createElement('canvas');
  canvas.width = Math.min(SAMPLE, w);
  canvas.height = Math.min(SAMPLE, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'other';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; // throws if tainted
  return classify(data);
}

/** Exported for unit tests: RGBA bytes in, verdict out. */
export function classify(data: ArrayLike<number>): TextureClass {
  const n = data.length / 4;
  if (n === 0) return 'other';
  let sum = 0;
  let sumSq = 0;
  let chroma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 230) return 'other'; // transparency: icon, sprite or overlay
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sum += lum;
    sumSq += lum * lum;
    chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return mean >= MIN_MEAN && std <= MAX_STD && chroma / n <= MAX_CHROMA ? 'light' : 'other';
}

export const TEXTURE_DECLARATION = 'background-color:var(--udm-bg-2)!important;background-blend-mode:multiply!important';
