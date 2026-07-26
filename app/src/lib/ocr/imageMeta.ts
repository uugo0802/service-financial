// 画像バイト列から幅・高さ・カラー/グレースケールをヘッダー解析のみで取得する簡易パーサ。
// sharp等の外部画像処理ライブラリを使わず、JPEG/PNGの主要マーカーのみを読む(依存追加を避けるための割り切り)。
// 電子帳簿保存法のスキャナ保存要件（解像度・カラー画像）の判定に使うための最低限の情報のみを返す。
// 対応外の形式（WebP/HEIC等）や壊れた画像は null を返し、呼び出し側で「判定不能」として扱う。

export interface ImageDimensions {
  width: number;
  height: number;
  /** true=カラー(RGB/YCbCr等)、false=グレースケール、null=形式上判定不能 */
  isColor: boolean | null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function parseImageDimensions(buffer: ArrayBuffer, mimeType: string): ImageDimensions | null {
  const bytes = new Uint8Array(buffer);
  if (mimeType === "image/png" || hasPngSignature(bytes)) {
    return parsePng(bytes);
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || hasJpegSignature(bytes)) {
    return parseJpeg(bytes);
  }
  return null;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function parsePng(bytes: Uint8Array): ImageDimensions | null {
  // シグネチャ(8) + IHDRチャンク長(4) + "IHDR"(4) + 幅(4) + 高さ(4) + ビット深度(1) + カラータイプ(1) + ...
  if (!hasPngSignature(bytes) || bytes.length < 26) return null;

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  const colorType = bytes[25];
  if (!width || !height) return null;

  // PNGカラータイプ: 0=グレースケール, 2=RGB, 3=パレット, 4=グレースケール+α, 6=RGBA
  const isColor = colorType === 0 || colorType === 4 ? false : colorType === 2 || colorType === 3 || colorType === 6 ? true : null;

  return { width, height, isColor };
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

// SOF0〜SOF15のうちDHT(0xC4)・JPG(0xC8)・DAC(0xCC)を除いたフレーム開始マーカー
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const MARKERS_WITHOUT_PAYLOAD = new Set([0x01, 0xd8, 0xd9]);

function parseJpeg(bytes: Uint8Array): ImageDimensions | null {
  if (!hasJpegSignature(bytes)) return null;

  let offset = 2; // SOIをスキップ
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];

    if (MARKERS_WITHOUT_PAYLOAD.has(marker) || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = readUint16BE(bytes, offset + 2);
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 >= bytes.length) return null;
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      const numComponents = bytes[offset + 9];
      if (!width || !height) return null;
      // 1=グレースケール, 3=YCbCr/RGB, 4=CMYK
      return { width, height, isColor: numComponents >= 3 };
    }

    if (segmentLength < 2) return null; // 壊れたセグメント長で無限ループするのを防ぐ
    offset += 2 + segmentLength;
  }
  return null;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
