/**
 * Modern GitLab Authentication Success Page Template
 * Features glassmorphism design with gradient background
 */

interface AuthSuccessTemplateData {
  sessionId: string;
  provider?: string;
  userEmail?: string;
  username?: string;
  autoCloseSeconds?: number;
}

interface AuthErrorTemplateData {
  error?: string;
  provider?: string;
  autoCloseSeconds?: number;
}

export function generateAuthSuccessPage(data: AuthSuccessTemplateData): string {
  const {
    sessionId,
    provider = 'GitLab',
    userEmail = '',
    username = '',
    autoCloseSeconds = 8
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful - QA Extension</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      min-height: 100vh;
      width: 100%;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      background: #ffffff;
      overflow: hidden;
    }

    .success-card {
      position: relative;
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 3rem 2rem;
      color: #000000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      text-align: center;
    }

    .check-icon-container {
      margin: 0 auto 2rem;
      display: grid;
      place-items: center;
      height: 4rem;
      width: 4rem;
      border-radius: 50%;
      background: #22c55e;
      animation: checkBounce 0.6s ease-out;
    }

    .check-icon {
      width: 2rem;
      height: 2rem;
      color: #ffffff;
      stroke-width: 3;
    }

    @keyframes checkBounce {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }

    .title {
      font-size: 1.5rem;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 1rem;
      text-align: center;
    }

    .subtitle {
      color: #666666;
      margin-bottom: 0;
      text-align: center;
    }

    .provider-name {
      color: #000000;
      font-weight: 500;
    }



    @media (max-width: 640px) {
      .success-card {
        padding: 2rem 1.5rem;
        margin: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="success-card" role="status" aria-live="polite">
    <div class="check-icon-container">
      <svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    </div>

    <h1 class="title">Authentication successful</h1>
    <p class="subtitle">
      You're signed in with <span class="provider-name">${provider}</span>.
    </p>
  </div>

  <script>
    console.log('OAuth success - Session ID: ${sessionId}');

    // Try to communicate with extension if possible
    try {
      window.postMessage({
        type: 'QA_EXTENSION_OAUTH_SUCCESS',
        sessionId: '${sessionId}'
      }, '*');
    } catch (e) {
      console.log('PostMessage failed:', e);
    }

    // Auto-close window after delay
    setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        console.log('Window close failed, user needs to close manually');
      }
    }, ${autoCloseSeconds * 1000});
  </script>
</body>
</html>
  `.trim();
}

export function generateAuthErrorPage(data: AuthErrorTemplateData): string {
  const {
    error = 'Authentication failed',
    provider = 'GitLab',
    autoCloseSeconds = 5
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Failed - QA Extension</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      min-height: 100vh;
      width: 100%;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      background: #ffffff;
      overflow: hidden;
    }

    .error-card {
      position: relative;
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 3rem 2rem;
      color: #000000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      text-align: center;
    }

    .error-icon-container {
      margin: 0 auto 2rem;
      display: grid;
      place-items: center;
      height: 4rem;
      width: 4rem;
      border-radius: 50%;
      background: #ef4444;
      animation: errorBounce 0.6s ease-out;
    }

    .error-icon {
      width: 2rem;
      height: 2rem;
      color: #ffffff;
      stroke-width: 3;
    }

    @keyframes errorBounce {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }

    .title {
      font-size: 1.5rem;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 1rem;
      text-align: center;
    }

    .subtitle {
      color: #666666;
      margin-bottom: 0;
      text-align: center;
    }

    .provider-name {
      color: #000000;
      font-weight: 500;
    }

    .error-details {
      margin: 1rem 0 0 0;
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid #dddddd;
      background: #f9f9f9;
      color: #666666;
      font-size: 0.875rem;
    }

    @media (max-width: 640px) {
      .error-card {
        padding: 2rem 1.5rem;
        margin: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="error-card" role="alert" aria-live="assertive">
    <div class="error-icon-container">
      <svg class="error-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18"/>
        <path d="M6 6l12 12"/>
      </svg>
    </div>

    <h1 class="title">Authentication failed</h1>
    <p class="subtitle">
      There was an error signing in with <span class="provider-name">${provider}</span>.
    </p>

    <div class="error-details">
      ${error}
    </div>
  </div>

  <script>
    console.log('OAuth failed:', '${error}');

    // Auto-close window after delay
    setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        console.log('Window close failed, user needs to close manually');
      }
    }, ${autoCloseSeconds * 1000});
  </script>
</body>
</html>
  `.trim();
}
