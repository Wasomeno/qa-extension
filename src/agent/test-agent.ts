import { QAAgent } from './agent/qa-agent';

async function main() {
  console.log('Initializing QAAgent...');
  try {
    const agent = new QAAgent({
      googleApiKey: 'dummy-key',
    });
    console.log('QAAgent initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize QAAgent:', error);
    process.exit(1);
  }
}

main();
