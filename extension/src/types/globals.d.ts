// Global type declarations for the extension

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

// Chrome extension API augmentations
declare namespace chrome {
  namespace contextMenus {
    interface OnClickData {
      pageX?: number;
      pageY?: number;
    }
  }
}

// React component props
declare module 'react' {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
  }
}

export {};