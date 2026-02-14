import * as readline from 'readline';
import { QAAgent } from './agent/qa-agent';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const googleApiKey = process.env.GOOGLE_API_KEY;

  if (!googleApiKey) {
    console.error('Error: GOOGLE_API_KEY must be set in .env');
    process.exit(1);
  }

  const agent = new QAAgent({
    googleApiKey,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Connected to GitLab via backend. Ask me anything.');
  console.log('-----------------------------------');

  const prompt = () => {
    rl.question('QA Agent > ', async input => {
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        rl.close();
        process.exit(0);
      }

      try {
        const stream = agent.chat(input);

        for await (const event of stream) {
          switch (event.type) {
            case 'text':
              process.stdout.write(`\nAgent: ${event.content}\n`);
              break;
            case 'tool_call':
              process.stdout.write(
                `\n[Tool Call: ${event.tool}] ${JSON.stringify(event.args)}\n`
              );
              break;
            case 'tool_result':
              process.stdout.write(
                `\n[Tool Result: ${event.tool}] Completed\n`
              );
              break;
            case 'error':
              process.stdout.write(`\n[Error] ${event.message}\n`);
              break;
            case 'done':
              // We already handled text
              break;
          }
        }
        process.stdout.write('\n');
      } catch (error) {
        console.error('\nError:', error);
      }

      prompt();
    });
  };

  prompt();
}

main();
