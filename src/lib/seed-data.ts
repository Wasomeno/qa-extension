import { TestBlueprint } from '@/types/recording';

export const SAMPLE_BLUEPRINT: TestBlueprint = {
  id: 'sample-google-search',
  name: 'Sample: Google Search',
  description: 'A simple test that navigates to Google and searches for "Pickle Rick".',
  // projectId is optional and number, so omitting it or using undefined is fine.
  steps: [
    {
      action: 'navigate',
      selector: 'body', // Dummy selector for navigate
      value: 'https://www.google.com',
      description: 'Navigate to Google',
    },
    {
      action: 'type',
      selector: 'textarea[name="q"]',
      value: 'Pickle Rick',
      description: 'Type search query',
    },
    {
      action: 'click',
      selector: 'input[name="btnK"]',
      description: 'Click search button',
    },
    {
      action: 'assert',
      selector: '#search',
      description: 'Verify results appear',
    }
  ],
  parameters: []
};
