// Script to install optional development dependencies
const { execSync } = require('child_process');

const devDependencies = [
  'chokidar@^3.5.3',
  'ws@^8.14.2', 
  'concurrently@^8.2.2'
];



try {
  // Check if dependencies are already installed
  try {
    require('chokidar');
    require('ws');
    require('concurrently');
    
    process.exit(0);
  } catch (e) {
    // Some dependencies are missing, install them
  }

  const installCommand = `npm install --save-dev ${devDependencies.join(' ')}`;
  
  
  execSync(installCommand, { stdio: 'inherit' });
  
  
  
} catch (error) {
  console.error('❌ Failed to install development dependencies');
  console.error('You can still use basic development mode with: npm run dev');
  console.error('Error:', error.message);
  process.exit(1);
}