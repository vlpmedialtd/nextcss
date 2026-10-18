// Reads pixel dimensions from image headers (PNG, JPEG, GIF, WebP, SVG). No dependencies.

export function imageSize(buf: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ascii = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));
  if (buf.length >= 24 && ascii(1, 3) === 'PNG') return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (buf.length >= 10 && ascii(0, 3) === 'GIF') return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  if (buf.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (kind === 'VP8L') {
      const b = dv.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width: w, height: h };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) return null;
      const marker = buf[o + 1];
      const len = dv.getUint16(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(o + 5), width: dv.getUint16(o + 7) };
      }
      o += 2 + len;
    }
    return null;
  }
  const text = new TextDecoder().decode(buf.subarray(0, 2048));
  const svg = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (svg) {
    const num = (name: string) => {
      const m = new RegExp(`\\s${name}=["']([\\d.]+)(px)?["']`).exec(svg);
      return m ? Math.round(parseFloat(m[1])) : null;
    };
    const w = num('width');
    const h = num('height');
    if (w && h) return { width: w, height: h };
    const vb = /viewBox=["'][\d.\-]+[\s,]+[\d.\-]+[\s,]+([\d.]+)[\s,]+([\d.]+)["']/.exec(svg);
    if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
  }
  return null;
}
