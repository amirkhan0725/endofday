/**
 * Native camera / photo-picker abstraction.
 *
 * On iOS / Android (Capacitor native build) this opens the platform camera
 * sheet so the user can take a photo or pick from their library.
 *
 * On the web it returns null and the caller should fall back to a <input type="file">.
 */

import type { Photo } from '@capacitor/camera';

/** Returns true when running inside a Capacitor native shell. */
export function isNative(): boolean {
  try {
    // Capacitor injects window.Capacitor on native builds
    return typeof window !== 'undefined' &&
      !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Opens the native camera / photo picker and returns a compressed base64
 * JPEG string (without data URI prefix), or null if unavailable / cancelled.
 */
export async function pickPhotoNative(): Promise<string | null> {
  if (!isNative()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo: Photo = await Camera.getPhoto({
      quality: 72,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,  // asks: Camera or Photo Library
      width: 800,
      correctOrientation: true,
    });
    return photo.base64String ?? null;
  } catch (err: unknown) {
    // User cancelled — not an error
    if (err instanceof Error && err.message?.includes('cancelled')) return null;
    if (typeof err === 'string' && err.toLowerCase().includes('cancel')) return null;
    console.error('Camera error:', err);
    return null;
  }
}

/**
 * Convert a capacitor:// or file:// webPath returned by GalleryPhoto to a base64 string.
 */
async function webPathToBase64(webPath: string): Promise<string> {
  const { Capacitor } = await import('@capacitor/core');
  const url = Capacitor.convertFileSrc(webPath);
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data URI prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Pick multiple photos from the native photo library.
 * Falls back gracefully if the platform doesn't support it.
 */
export async function pickMultiplePhotosNative(): Promise<string[]> {
  if (!isNative()) return [];

  try {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.pickImages({
      quality: 72,
      width: 800,
      limit: 8,
    });
    const base64s = await Promise.allSettled(
      result.photos.map(p => webPathToBase64(p.webPath))
    );
    return base64s.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  } catch {
    // pickImages may not be available on older plugin versions — fall back to single pick
    const single = await pickPhotoNative();
    return single ? [single] : [];
  }
}
