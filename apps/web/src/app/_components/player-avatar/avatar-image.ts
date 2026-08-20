import { PLAYER_AVATAR_MAX_INPUT_BYTES } from "./avatar-contract";

const MAX_DECODED_PIXELS = 16_000_000;
const MIN_SOURCE_EDGE = 512;
const OUTPUT_MAX_EDGE = 2048;
const OUTPUT_MAX_BYTES = 4 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageDimensions {
  readonly height: number;
  readonly type: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
}

interface DrawableImage {
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly width: number;
  close(): void;
}

export async function preparePlayerAvatarInput(file: File): Promise<Blob> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Välj en JPG-, PNG- eller WebP-bild.");
  if (file.size <= 0) throw new Error("Bilden är tom.");
  if (file.size > PLAYER_AVATAR_MAX_INPUT_BYTES) throw new Error("Bilden får vara högst 8 MB.");

  const sourceDimensions = readImageDimensions(new Uint8Array(await file.arrayBuffer()));
  if (!sourceDimensions || sourceDimensions.type !== file.type) {
    throw new Error("Bildens filinnehåll stämmer inte med det angivna formatet.");
  }
  validateDimensions(sourceDimensions.width, sourceDimensions.height);

  const image = await decodeImage(file);
  try {
    validateDimensions(image.width, image.height);
    const scale = Math.min(1, OUTPUT_MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Webbläsaren kunde inte bearbeta bilden.");
    context.fillStyle = "#f4f2ee";
    context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, image.width, image.height, 0, 0, width, height);
    const output = await canvasToJpeg(canvas);
    if (output.size <= 0 || output.size > OUTPUT_MAX_BYTES) {
      throw new Error("Den bearbetade bilden blev för stor. Prova en enklare bild.");
    }
    return output;
  } finally {
    image.close();
  }
}

function validateDimensions(width: number, height: number): void {
  if (Math.min(width, height) < MIN_SOURCE_EDGE) {
    throw new Error("Bilden behöver vara minst 512 × 512 pixlar.");
  }
  if (width * height > MAX_DECODED_PIXELS) {
    throw new Error("Bilden får vara högst 16 megapixlar.");
  }
}

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 24
    || !signature.every((value, index) => bytes[index] === value)
    || ascii(bytes, 12, 4) !== "IHDR"
  ) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return validDimensions(width, height) ? { height, type: "image/png", width } : null;
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = (readByte(bytes, offset) << 8) | readByte(bytes, offset + 1);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (isStartOfFrame(marker) && segmentLength >= 7) {
      const height = (readByte(bytes, offset + 3) << 8) | readByte(bytes, offset + 4);
      const width = (readByte(bytes, offset + 5) << 8) | readByte(bytes, offset + 6);
      return validDimensions(width, height) ? { height, type: "image/jpeg", width } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  let width = 0;
  let height = 0;
  if (chunk === "VP8X") {
    width = 1 + uint24LittleEndian(bytes, 24);
    height = 1 + uint24LittleEndian(bytes, 27);
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = (
      readByte(bytes, 21)
      | (readByte(bytes, 22) << 8)
      | (readByte(bytes, 23) << 16)
      | (readByte(bytes, 24) << 24)
    ) >>> 0;
    width = 1 + (bits & 0x3fff);
    height = 1 + ((bits >>> 14) & 0x3fff);
  } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = (readByte(bytes, 26) | (readByte(bytes, 27) << 8)) & 0x3fff;
    height = (readByte(bytes, 28) | (readByte(bytes, 29) << 8)) & 0x3fff;
  }
  return validDimensions(width, height) ? { height, type: "image/webp", width } : null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return readByte(bytes, offset) | (readByte(bytes, offset + 1) << 8) | (readByte(bytes, offset + 2) << 16);
}

function readByte(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

async function decodeImage(file: File): Promise<DrawableImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { close: () => bitmap.close(), height: bitmap.height, source: bitmap, width: bitmap.width };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return {
      close: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight,
      source: image,
      width: image.naturalWidth,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Bilden kunde inte konverteras."));
    }, "image/jpeg", 0.88);
  });
}
