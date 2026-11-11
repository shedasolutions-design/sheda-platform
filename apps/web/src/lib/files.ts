/**
 * The shape the upload helpers in services/api.ts expect (carried over from
 * expo-image-picker): a fetchable uri, a MIME type and a file name. A blob:
 * URL from the browser's File is fetchable, so uploads work unchanged.
 */
export interface PickedAsset {
  uri: string;
  mimeType: string;
  fileName: string;
}

export function fileToAsset(file: File): PickedAsset {
  return { uri: URL.createObjectURL(file), mimeType: file.type || "application/octet-stream", fileName: file.name };
}
