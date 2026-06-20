const configuredBaseUrl =
  process.env.QA_WEB_APP_URL || process.env.VITE_QA_WEB_APP_URL || '';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getQaWebAppUrl(path = '/'): string | null {
  const baseUrl = normalizeBaseUrl(configuredBaseUrl);
  if (!baseUrl) return null;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function getQaWebAppHomeUrl(): string | null {
  return getQaWebAppUrl('/');
}

export function getQaWebAppRecordingsUrl(): string | null {
  return getQaWebAppUrl('/recordings');
}

export function getQaWebAppRecordingDetailUrl(id: string): string | null {
  return getQaWebAppUrl(`/recordings/${encodeURIComponent(id)}`);
}

export function getQaWebAppMenuUrl(data?: {
  initialView?: string;
  initialIssue?: any;
}): string | null {
  const params = data?.initialIssue;

  switch (data?.initialView) {
    case 'recordings':
      return getQaWebAppRecordingsUrl();
    case 'issues': {
      const projectId = params?.project_id ?? params?.projectId;
      const issueIid = params?.iid ?? params?.issue_iid ?? params?.issueIid;
      if (projectId && issueIid) {
        return getQaWebAppUrl(
          `/issues/${encodeURIComponent(String(projectId))}/${encodeURIComponent(String(issueIid))}`
        );
      }
      return getQaWebAppUrl('/issues');
    }
    case 'create-issue':
      return getQaWebAppUrl('/create-issue');
    default:
      return getQaWebAppHomeUrl();
  }
}
