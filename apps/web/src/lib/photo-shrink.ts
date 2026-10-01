// Shrink a photo in the browser before it is uploaded (ADR 0006): at most
// 1600 px on the long side, re-saved as JPEG. Re-saving also drops the camera's
// metadata (location included). HEIC and other types the browser cannot draw
// are refused with a message the page shows as is.

import { HOMEWORK_LIMITS } from "@homework/shared";

export const PHOTO_MAX_EDGE = 1600;
const QUALITIES = [0.82, 0.6];

export class PhotoReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoReadError";
  }
}

/** Width × height that fit within `max` on the long side; never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  max = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoReadError(
      "This photo can't be read here (iPhone photos are often HEIC). Save it as a JPEG and try again.",
    );
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoReadError("This browser can't prepare photos.");
  // A transparent PNG turns white, not black, as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= HOMEWORK_LIMITS.photoBytesMax) return blob;
  }
  throw new PhotoReadError("This photo is too large even after shrinking it.");
}
