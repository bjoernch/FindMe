// Use direct file path — Metro bundler doesn't resolve package.json "exports" subpaths
import decodeQR from "@paulmillr/qr/decode.js";
import { decode as decodeJpeg } from "jpeg-js";
import { Buffer } from "buffer";

/**
 * Decode a QR code from a base64-encoded JPEG image.
 * Uses pure JS libraries (@paulmillr/qr + jpeg-js) — no native dependencies.
 * Returns the QR code data string, or null if no QR code found.
 */
export function decodeQRFromBase64(base64: string): string | null {
  try {
    const buf = Buffer.from(base64, "base64");
    const { data, width, height } = decodeJpeg(buf, {
      useTArray: true,
      formatAsRGBA: true,
    });

    const result = decodeQR({ data: new Uint8Array(data), width, height });
    return result ?? null;
  } catch (e) {
    console.warn("QR decode error:", e);
    return null;
  }
}
