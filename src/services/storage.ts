export interface ExtensionSettings {
  theme: 'light' | 'dark' | 'auto';
  defaultProject?: string;
  notificationSettings: {
    desktop: boolean;
    sound: boolean;
    slack: boolean;
  };
}

export const storageService = {
  get: async (key: string): Promise<any> => {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  },
  set: async (key: string, value: any): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  },
  remove: async (key: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  }
};