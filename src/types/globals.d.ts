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
      R2_ACCOUNT_ID?: string;
      R2_BUCKET_NAME?: string;
      R2_ACCESS_KEY_ID?: string;
      R2_SECRET_ACCESS_KEY?: string;
      R2_PUBLIC_DOMAIN?: string;
    };
  };

  const __GOOGLE_API_KEY__: string;
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
