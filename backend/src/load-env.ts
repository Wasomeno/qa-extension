import dotenv from 'dotenv';
import path from 'path';

// Load environment variables as early as possible.
// 1) Load backend/.env (cwd when running `cd backend && npm run dev`)
dotenv.config();

// 2) If OPENAI_API_KEY (or other vars) still missing, try root ../.env
if (!process.env.OPENAI_API_KEY) {
  const rootEnv = path.resolve(process.cwd(), '../.env');
  dotenv.config({ path: rootEnv });
}

// 3) No exports – side-effect only

