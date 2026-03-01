/**
 * Downloads content as a file in the browser
 */
export function downloadFile(content: string | Blob, filename: string, mimeType: string = 'text/plain'): void {
  let blob: Blob;

  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = content;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Downloads text content as a file
 */
export function downloadTextFile(content: string, filename: string): void {
  downloadFile(content, filename, 'text/plain;charset=utf-8');
}

/**
 * Downloads JSON content as a file
 */
export function downloadJsonFile(content: object, filename: string): void {
  const jsonString = JSON.stringify(content, null, 2);
  downloadFile(jsonString, filename, 'application/json');
}

/**
 * Downloads video blob as a file
 */
export function downloadVideoFile(blob: Blob, filename: string): void {
  const mimeType = blob.type || 'video/webm';
  downloadFile(blob, filename, mimeType);
}

/**
 * Generates a video filename for a blueprint
 */
export function generateVideoFilename(blueprintName: string, blueprintId: string, mimeType: string = 'video/webm'): string {
  const sanitizedName = blueprintName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const isMp4 = mimeType.includes('mp4') || mimeType.includes('h264');
  const extension = isMp4 ? 'mp4' : 'webm';
  return `${sanitizedName || 'recording'}-${blueprintId.slice(0, 8)}.${extension}`;
}
