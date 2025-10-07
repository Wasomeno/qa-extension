import dotenv from 'dotenv';
import path from 'path';

// Always load the backend-specific .env file.
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// No exports – side-effect only
