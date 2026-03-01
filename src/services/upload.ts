import { MessageType } from "@/types/messages";

export const uploadService = {
  /**
   * Uploads a file or blob to Cloudflare R2 via background script to bypass CORS
   * @param file File or Blob to upload
   * @param fileName Name of the file in the bucket
   * @returns The public/internal URL of the uploaded file
   */
  async uploadFile(file: File | Blob, fileName: string): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: MessageType.R2_UPLOAD,
          data: {
            body: Array.from(body), // Convert to regular array for serialization
            fileName,
            contentType: file.type,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || "R2 Upload failed"));
          }
        }
      );
    });
  },
};
