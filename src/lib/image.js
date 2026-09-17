/**
 * Image decoding, deliberately narrow.
 *
 * PNG and JPEG only, both via pure-JavaScript decoders, because a beginner on
 * a Mac should never be asked to compile a native module to read a photograph.
 * Anything else gets a named, actionable refusal rather than a crash.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg'];

export class ImageError extends Error {
  constructor(message, { code, fix } = {}) {
    super(message);
    this.name = 'ImageError';
    this.code = code || 'IMAGE_ERROR';
    this.fix = fix || null;
  }
}

/** Sniff the real format from magic bytes, not from the file extension. */
export function sniffFormat(buffer) {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 12) === 'ftypavif') return 'avif';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 12) === 'ftypheic') return 'heic';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '<svg') return 'svg';
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '<?xml') return 'svg';
  return 'unknown';
}

const CONVERT_HINT =
  'Open it in Preview (it is already on your Mac), choose File > Export, and pick PNG or JPEG.';

/**
 * Decode an image file to raw RGBA.
 * @returns {Promise<{width:number,height:number,data:Uint8Array,format:string,bytes:number}>}
 */
export async function decodeImage(filePath) {
  const abs = path.resolve(filePath);

  let info;
  try {
    info = await stat(abs);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ImageError(`No file at ${abs}`, {
        code: 'IMAGE_NOT_FOUND',
        fix: 'Check the path. Drag the image into the Terminal window to paste its exact path.'
      });
    }
    throw new ImageError(`Could not read ${abs}: ${err.code || err.message}`, {
      code: 'IMAGE_UNREADABLE',
      fix: 'Check that the file is not inside a folder the app cannot open.'
    });
  }

  if (info.isDirectory()) {
    throw new ImageError(`${abs} is a folder, not an image.`, {
      code: 'IMAGE_IS_DIRECTORY',
      fix: 'Point this at a single .png or .jpg file.'
    });
  }
  if (info.size === 0) {
    throw new ImageError(`${abs} is an empty file (0 bytes).`, {
      code: 'IMAGE_EMPTY',
      fix: 'The file did not copy or download properly. Get the image again.'
    });
  }

  const buffer = await readFile(abs);
  const format = sniffFormat(buffer);

  if (format === 'png') {
    const { PNG } = await import('pngjs');
    let png;
    try {
      png = PNG.sync.read(buffer);
    } catch (err) {
      throw new ImageError(`That PNG could not be decoded: ${err.message}`, {
        code: 'IMAGE_CORRUPT',
        fix: 'Re-export the file. Open it in Preview and use File > Export as PNG.'
      });
    }
    return {
      width: png.width,
      height: png.height,
      data: png.data,
      format: 'png',
      bytes: info.size
    };
  }

  if (format === 'jpeg') {
    const jpeg = (await import('jpeg-js')).default;
    let img;
    try {
      img = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
    } catch (err) {
      throw new ImageError(`That JPEG could not be decoded: ${err.message}`, {
        code: 'IMAGE_CORRUPT',
        fix: 'Re-export the file. Open it in Preview and use File > Export as JPEG.'
      });
    }
    return {
      width: img.width,
      height: img.height,
      data: img.data,
      format: 'jpeg',
      bytes: info.size
    };
  }

  const named = {
    webp: 'WebP',
    avif: 'AVIF',
    heic: 'HEIC (the format an iPhone shoots by default)',
    gif: 'GIF',
    svg: 'SVG (a drawing, not a photograph — it has no pixels to sample)'
  }[format];

  throw new ImageError(
    named
      ? `That file is ${named}. This tool reads PNG and JPEG only.`
      : `Could not tell what kind of image ${path.basename(abs)} is. This tool reads PNG and JPEG only.`,
    {
      code: 'IMAGE_UNSUPPORTED_FORMAT',
      fix: format === 'svg'
        ? 'Pick a photograph instead, or set the palette colours by hand.'
        : CONVERT_HINT
    }
  );
}

/**
 * Sample an RGBA buffer down to at most `budget` opaque pixels, on a regular
 * grid. Quantisers do not need every pixel, and sampling keeps a 12-megapixel
 * phone photo from taking thirty seconds.
 *
 * @returns {{pixels: Array<{r,g,b}>, sampled: number, skippedTransparent: number, stride: number}}
 */
export function samplePixels({ width, height, data }, { budget = 20000, alphaThreshold = 128 } = {}) {
  const total = width * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(total / budget)));
  const pixels = [];
  let skippedTransparent = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < alphaThreshold) {
        skippedTransparent++;
        continue;
      }
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  return { pixels, sampled: pixels.length, skippedTransparent, stride };
}
