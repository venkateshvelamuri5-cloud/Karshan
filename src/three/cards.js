import * as THREE from 'three';

// Draws a wish as a polaroid-style card (photo on top, words below) onto a canvas texture.
// Wishes without a photo get a colourful lettered card instead.

const W = 720, H = 900, PAD = 36, PH = 600;

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hashHue(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export async function cardTexture({ photo, from, message, accent = '#ffab3d' }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  // paper
  x.fillStyle = '#fbf6ea';
  x.fillRect(0, 0, W, H);
  // photo, or a generated panel
  let img = null;
  if (photo) { try { img = await loadImage(photo); } catch { img = null; } }
  if (img) {
    const s = Math.max((W - PAD * 2) / img.width, PH / img.height);
    const w = img.width * s, h = img.height * s;
    x.save();
    x.beginPath(); x.rect(PAD, PAD, W - PAD * 2, PH); x.clip();
    x.drawImage(img, PAD + (W - PAD * 2 - w) / 2, PAD + (PH - h) / 2, w, h);
    x.restore();
  } else {
    const hue = hashHue(from + message);
    const g = x.createLinearGradient(PAD, PAD, W - PAD, PAD + PH);
    g.addColorStop(0, `hsl(${hue},70%,62%)`);
    g.addColorStop(1, `hsl(${(hue + 50) % 360},75%,45%)`);
    x.fillStyle = g;
    x.fillRect(PAD, PAD, W - PAD * 2, PH);
    x.fillStyle = 'rgba(255,255,255,.95)';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'italic 600 58px Fraunces, Georgia, serif';
    const lines = wrap(x, message, W - PAD * 2 - 80).slice(0, 6);
    const lh = 70, y0 = PAD + PH / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => x.fillText(l, W / 2, y0 + i * lh));
  }
  // words under the photo
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#2a2236';
  if (img) {
    x.font = 'italic 500 34px Fraunces, Georgia, serif';
    wrap(x, message, W - PAD * 2).slice(0, 3).forEach((l, i) => x.fillText(l, PAD, PAD + PH + 62 + i * 44));
  }
  x.fillStyle = accent;
  x.font = '700 34px Barlow, sans-serif';
  x.fillText('— ' + from, PAD, H - 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Resize a chosen photo in the browser before upload: max 1080px, JPEG, about 150 KB.
export async function shrinkPhoto(file, max = 1080) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82, data = c.toDataURL('image/jpeg', q);
    while (data.length > 560000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
    return { mime: 'image/jpeg', data: data.split(',')[1], preview: data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Made-up illustrated "photos" for the demo wall (no real people).
export function demoPhoto(seed) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 560;
  const x = c.getContext('2d');
  const hue = (seed * 67) % 360;
  const g = x.createLinearGradient(0, 0, 640, 560);
  g.addColorStop(0, `hsl(${hue},65%,55%)`);
  g.addColorStop(1, `hsl(${(hue + 80) % 360},70%,30%)`);
  x.fillStyle = g; x.fillRect(0, 0, 640, 560);
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `hsla(${(hue + i * 25) % 360},90%,${60 + (i % 3) * 10}%,.55)`;
    x.beginPath();
    x.arc(((seed * 97 + i * 151) % 640), ((seed * 53 + i * 89) % 560), 20 + ((i * 37) % 90), 0, Math.PI * 2);
    x.fill();
  }
  x.font = '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(['🎂', '🎈', '🌸', '🎉', '✨', '🪔'][seed % 6], 320, 290);
  return c.toDataURL('image/jpeg', 0.85);
}
