/** Getting a photo ready to send, and cleaning up after. */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { targetSize } from './photo';

export type Photo = { uri: string; base64: string; width: number; height: number };

/**
 * Shrink a photo and save it again as a JPEG. Saving anew also leaves behind what the camera
 * wrote into the file, including where it was taken.
 */
export async function preparePhoto(source: { uri: string; width: number; height: number }): Promise<Photo> {
  const edit = ImageManipulator.manipulate(source.uri);
  const size = targetSize(source.width, source.height);
  if (size) edit.resize(size);
  const image = await edit.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('no image data');
  return { uri: saved.uri, base64: saved.base64, width: saved.width, height: saved.height };
}

/** Delete a temporary copy. Only files in the app's cache are touched, never your own pictures. */
export function discardPhoto(uri: string) {
  try {
    if (uri.startsWith(Paths.cache.uri)) new File(uri).delete();
  } catch {
    // The phone clears its cache by itself if this fails
  }
}
