import { describe, expect, it } from 'vitest';
import { classify, singleImageUrl } from '../../src/engine/media/texture-handler';

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
const flat = (n: number, p: number[]) => Array.from({ length: n }, () => p).flat();

describe('texture classification', () => {
  it('accepts flat light opaque images (white column with gray shadow edges)', () => {
    expect(classify([...flat(30, px(255, 255, 255)), ...flat(2, px(217, 217, 217))])).toBe('light');
  });

  it.each([
    ['transparent sprite', flat(16, px(255, 255, 255, 40))],
    ['dark image', flat(16, px(30, 30, 30))],
    ['colorful light image', flat(16, px(255, 220, 120))],
    ['high-contrast photo', [...flat(8, px(255, 255, 255)), ...flat(8, px(0, 0, 0))]],
  ])('rejects %s', (_name, data) => {
    expect(classify(data)).toBe('other');
  });

  it('extracts a single url() layer only', () => {
    expect(singleImageUrl('url("http://x/a.gif")')).toBe('http://x/a.gif');
    expect(singleImageUrl('url("a.gif"), url("b.gif")')).toBeNull();
    expect(singleImageUrl('linear-gradient(red, blue)')).toBeNull();
    expect(singleImageUrl('none')).toBeNull();
  });
});
