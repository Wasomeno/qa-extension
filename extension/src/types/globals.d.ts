// Global type declarations for the extension

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }

  // Webpack injects process.env at build time; provide minimal typings
  const process: {
    env: {
      NODE_ENV?: string;
      BASE_API_URL: string;
    };
  };
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
