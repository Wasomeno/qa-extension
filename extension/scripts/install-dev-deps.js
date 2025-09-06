// Script to install optional development dependencies
const { execSync } = require('child_process');

const devDependencies = [
  'chokidar@^3.5.3',
  'ws@^8.14.2', 
  'concurrently@^8.2.2'
];

console.log('📦 Installing optional development dependencies...');

try {
  // Check if dependencies are already installed
  try {
    require('chokidar');
    require('ws');
    require('concurrently');
    console.log('✅ All development dependencies are already installed!');
    process.exit(0);
  } catch (e) {
    // Some dependencies are missing, install them
  }

  const installCommand = `npm install --save-dev ${devDependencies.join(' ')}`;
  console.log(`Running: ${installCommand}`);
  
  execSync(installCommand, { stdio: 'inherit' });
  console.log('✅ Development dependencies installed successfully!');
  console.log('🚀 You can now use: npm run dev:hot');
  
} catch (error) {
  console.error('❌ Failed to install development dependencies');
  console.error('You can still use basic development mode with: npm run dev');
  console.error('Error:', error.message);
  process.exit(1);
}