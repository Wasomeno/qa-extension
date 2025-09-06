import { GitLabService } from '../services/gitlab';

// Demo: parse checklist items from sample description or a live issue if env vars are set.

async function main() {
  const accessToken = process.env.GITLAB_ACCESS_TOKEN;
  const baseUrl = process.env.GITLAB_BASE_URL; // e.g., https://gitlab.com or your self-hosted URL
  const projectId = process.env.PROJECT_ID;
  const issueIid = process.env.ISSUE_IID ? Number(process.env.ISSUE_IID) : undefined;

  const gl = new GitLabService(accessToken, baseUrl);

  if (accessToken && projectId && issueIid) {
    try {
      const items = await gl.getIssueChecklist(projectId, issueIid);
      console.log('Checklist items from live GitLab issue:');
      for (const it of items) {
        console.log(`- [${it.checked ? 'x' : ' '}] ${it.text} (line ${it.line})`);
      }
      if (!items.length) console.log('(none found)');
      return;
    } catch (err) {
      console.warn('Live fetch failed, falling back to sample description.', err);
    }
  }

  const sample = `This is an issue description with tasks:\n\n- [ ] Set up project scaffolding\n- [x] Configure CI pipeline\n* [ ] Add integration tests\n1. [X] Document API endpoints\nSome other paragraph without checkbox.\n  - [ ] Indented task still counts\n+ [ ] Plus-style list item\n- [] not a checkbox (ignored)\n- [x ] malformed checkbox (ignored)`;

  const items = gl.parseChecklistFromDescription(sample);
  console.log('Checklist items from sample description:');
  for (const it of items) {
    console.log(`- [${it.checked ? 'x' : ' '}] ${it.text} (line ${it.line})`);
  }
  if (!items.length) console.log('(none found)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

