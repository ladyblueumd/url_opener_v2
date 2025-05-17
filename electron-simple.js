const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Store URL history
const urlHistory = [];

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Enable for functionality
      contextIsolation: false, // Disable for communication
      webSecurity: true, // Keep security enabled
      webviewTag: true, // Enable webview for embedded browser
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Determine the start URL
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'build', 'index.html')}`;

  // Load the URL
  mainWindow.loadURL(startUrl);
  
  // Open the DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Log when the window is closed
  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(() => {
  console.log('App is ready');
  createWindow();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log('App activated');
  if (mainWindow === null) {
    createWindow();
  }
});

// Log any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Handle IPC events
ipcMain.on('log-url-opened', (event, data) => {
  // Add to URL history
  urlHistory.push(data);
  
  // Log the URL
  console.log('URL opened:', data);
});

// Disable opening external links - use embedded browser instead
ipcMain.on('open-external', (event, url) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'External Browser Disabled',
    message: 'External browser opening has been disabled. Please use the embedded browser only.',
    buttons: ['OK']
  });
}); 