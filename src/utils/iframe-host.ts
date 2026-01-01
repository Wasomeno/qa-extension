export interface IframeHostConfig {
  id: string;
  css?: string;
}

export interface IframeHostInstance {
  iframe: HTMLIFrameElement;
  document: Document;
  container: HTMLElement; // React mount node inside iframe
  destroy: () => void;
}

export function createIframeHost(config: IframeHostConfig): IframeHostInstance {
  const { id, css } = config;

  // Create iframe overlay
  const iframe = document.createElement('iframe');
  iframe.id = id;
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    border: '0',
    zIndex: '2147483647',
    pointerEvents: 'none', // UI inside will opt-in per element
    background: 'transparent',
  });
  // Allow transparency
  iframe.setAttribute('allowtransparency', 'true');

  // Build srcdoc with base styles and root container
  const src = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      :root { color-scheme: light; }
      /* Reset inheritable properties and set baseline */
      body {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.4;
        color: #0b1220;
      }
      * { box-sizing: border-box; }
      /* Mount root opt-in pointer events so children can be interactive */
      #__qa_root { position: relative; width: 100vw; height: 100vh; pointer-events: none; }
    </style>
    ${css ? `<style>${css}</style>` : ''}
  </head>
  <body>
    <div id=\"__qa_root\"></div>
  </body>
  </html>`;

  iframe.srcdoc = src;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  const container = doc.getElementById('__qa_root') as HTMLElement;

  return {
    iframe,
    document: doc,
    container,
    destroy: () => {
      iframe.remove();
    },
  };
}

