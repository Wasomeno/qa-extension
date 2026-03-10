
// This file runs in the offscreen document to capture video from a tab
// and upload it to Cloudflare R2.

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Note: AWS SDK in offscreen document might need bundler support.
// Assuming it is available through the project's build setup (rspack/webpack).
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'placeholder',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'placeholder',
  },
});

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'START_VIDEO_CAPTURE') {
    const { tabId, recordingId } = message.data;
    try {
      const streamId = await new Promise<string>((resolve) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, resolve);
      });
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        } as MediaTrackConstraints,
      });

      mediaRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm' });
      recordedChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const fileName = `recordings/${recordingId}.webm`;
        const arrayBuffer = await blob.arrayBuffer();
        const body = new Uint8Array(arrayBuffer);

        await s3Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME as string,
            Key: fileName,
            Body: body,
            ContentType: 'video/webm'
        }));
        
        const publicDomain = process.env.R2_PUBLIC_DOMAIN || 'YOUR_R2_PUBLIC_DOMAIN_HERE';
        const videoUrl = `${publicDomain}/${fileName}`;
        chrome.runtime.sendMessage({ type: 'VIDEO_CAPTURE_COMPLETE', data: { recordingId, videoUrl } });
      };
      
      mediaRecorder.start();
      sendResponse({ success: true });
    } catch (e: any) {
        sendResponse({ success: false, error: e.message });
    }
  } else if (message.type === 'STOP_VIDEO_CAPTURE') {
      mediaRecorder?.stop();
      mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      sendResponse({ success: true });
  }
  return true;
});
