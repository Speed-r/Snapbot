// Bildvergleich per "Difference Hash" (dHash).
// Jedes Bild wird auf 9x8 Pixel Graustufen verkleinert und daraus ein 64-Bit-Fingerabdruck gebildet.
// Gleiche oder sehr ähnliche Bilder (auch neu komprimiert, skaliert, als Screenshot) haben
// fast denselben Fingerabdruck. Der Unterschied wird als Hamming-Distanz (0–64) gemessen.

const sharp = require('sharp');

async function dHash(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate() // EXIF-Drehung berücksichtigen
    .removeAlpha()
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const links = data[(y * 9 + x) * ch];
      const rechts = data[(y * 9 + x + 1) * ch];
      hash = (hash << 1n) | (links > rechts ? 1n : 0n);
    }
  }
  return hash;
}

async function hashVonUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return dHash(buffer);
}

function hamming(a, b) {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

module.exports = { dHash, hashVonUrl, hamming };
