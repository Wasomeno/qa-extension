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


