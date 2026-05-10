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
    
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      
      
      ws.on('close', () => {
        this.clients.delete(ws);
        
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
      
      
      // Debounce rapid file changes
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        this.notifyReload();
      }, 500);
    });

    watcher.on('add', (path) => {
      
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        this.notifyReload();
      }, 500);
    });
  }

  notifyReload() {
    if (this.clients.size === 0) {
      
      return;
    }

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'reload' }));
      }
    });
    
    
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  
  process.exit(0);
});

  new ExtensionReloader();
} catch (error) {
  console.error('❌ Hot reload dependencies not installed. Run: npm install');
  console.error('For basic development, use: npm run dev');
  process.exit(1);
}