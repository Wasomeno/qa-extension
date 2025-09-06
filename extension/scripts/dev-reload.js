// Development hot reload script for browser extension
// This script automatically reloads the extension when files change

try {
  const chokidar = require('chokidar');
  const WebSocket = require('ws');
  const path = require('path');

const PORT = 8080;
const WATCH_PATHS = [
  path.resolve(__dirname, '../dist'),
  path.resolve(__dirname, '../src')
];

class ExtensionReloader {
  constructor() {
    this.wss = new WebSocket.Server({ port: PORT });
    this.clients = new Set();
    this.setupWebSocketServer();
    this.setupFileWatcher();
    console.log(`🔥 Extension hot reload server started on port ${PORT}`);
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('📱 Extension connected for hot reload');
      
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('📱 Extension disconnected from hot reload');
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  setupFileWatcher() {
    const watcher = chokidar.watch(WATCH_PATHS, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    let reloadTimeout;
    
    watcher.on('change', (path) => {
      console.log(`📝 File changed: ${path}`);
      
      // Debounce rapid file changes
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        this.notifyReload();
      }, 500);
    });

    watcher.on('add', (path) => {
      console.log(`📄 File added: ${path}`);
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        this.notifyReload();
      }, 500);
    });
  }

  notifyReload() {
    if (this.clients.size === 0) {
      console.log('🔄 Files changed but no extension connected');
      return;
    }

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'reload' }));
      }
    });
    
    console.log('🔄 Reload signal sent to extension');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down hot reload server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down hot reload server...');
  process.exit(0);
});

  new ExtensionReloader();
} catch (error) {
  console.error('❌ Hot reload dependencies not installed. Run: npm install');
  console.error('For basic development, use: npm run dev');
  process.exit(1);
}