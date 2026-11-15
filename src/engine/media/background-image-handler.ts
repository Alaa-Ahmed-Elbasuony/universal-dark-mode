/**
 * Text over photographic backgrounds. The page chose its text color for that image, and we
 * can't know the image's brightness, so such text keeps its ORIGINAL color instead of being
 * remapped for a dark page. Only large banners qualify: thin textures on the canvas or on
 * ordinary containers are treated as normal surfaces.
 */
export function hasUrlImage(backgroundImage: string): boolean {
  return /url\(/.test(backgroundImage);
}

export function isLargeBanner(carrier: Element): boolean {
  if (carrier === carrier.ownerDocument.body || carrier === carrier.ownerDocument.documentElement) return false;
  const r = carrier.getBoundingClientRect();
  return r.width >= 200 && r.height >= 100;
}
