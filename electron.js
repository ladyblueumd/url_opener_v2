const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');
const url = require('url');

let mainWindow;

// Store URL history
const urlHistory = [];

// Prevent opening external browsers at startup
app.on('will-finish-launching', () => {
  // Explicitly prevent the shell from opening external applications
  shell.openExternal = (url) => {
    console.log('Blocked attempt to open external browser with URL:', url);
    return Promise.resolve();
  };
});

// Block external browsers globally
app.on('ready', () => {
  // Override the shell.openExternal function to prevent any external browser from opening
  shell.openExternal = (url) => {
    console.log('Blocked attempt to open external browser with URL:', url);
    return Promise.resolve();
  };
  
  // Prevent protocol handling which could open external apps
  app.removeAsDefaultProtocolClient('http');
  app.removeAsDefaultProtocolClient('https');
  app.setAsDefaultProtocolClient = () => false;
});

function createWindow() {
  // Enable webview debugging
  app.commandLine.appendSwitch('remote-debugging-port', '8315');
  // Allow insecure SSL
  app.commandLine.appendSwitch('ignore-certificate-errors');
  // Disable same-origin policy
  app.commandLine.appendSwitch('disable-web-security');
  // Disable CORS
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Enable Node.js integration for proper functionality
      contextIsolation: false, // Disable context isolation to allow proper communication
      webSecurity: false, // Disable web security to allow cross-origin requests
      allowRunningInsecureContent: true, // Allow insecure content for testing
      sandbox: false, // Disable sandbox mode for full functionality
      webviewTag: true, // Enable webview tag for embedded browser
      enableRemoteModule: true, // Enable remote module
      preload: path.join(__dirname, 'preload.js') // Add preload script if it exists
    }
  });

  // Set up a basic preload script if it doesn't exist
  const preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    fs.writeFileSync(preloadPath, `
      // Preload script to expose Electron APIs to renderer process
      const { contextBridge, ipcRenderer } = require('electron');
      
      // Expose the ipcRenderer to the window object
      window.ipcRenderer = ipcRenderer;
    `);
  }

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'build', 'index.html')}`;
  
  // Check if React dev server is running before trying to connect
  if (isDev) {
    const http = require('http');
    const checkServerRunning = () => {
      http.get('http://localhost:3000', (res) => {
        if (res.statusCode === 200) {
          mainWindow.loadURL(startUrl);
        } else {
          // Try again after a delay
          setTimeout(checkServerRunning, 1000);
        }
      }).on('error', (err) => {
        console.log('Development server not ready yet, retrying in 1 second...');
        setTimeout(checkServerRunning, 1000);
      });
    };
    
    checkServerRunning();
  } else {
    mainWindow.loadURL(startUrl);
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', () => {
  createWindow();
  
  // Configure session to handle authentication redirects
  const mainSession = session.defaultSession;
  
  // Enable cookies and persistent session storage
  mainSession.cookies.set({
    url: 'https://localhost',
    name: 'session-cookie',
    value: 'enabled',
    httpOnly: true,
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  });
  
  // Set up permissive Content-Security-Policy to allow OAuth redirects
  mainSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline' ws: wss:; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';"],
        'Access-Control-Allow-Origin': ['*']
      }
    });
  });
  
  // Improved redirect handling for OAuth
  mainSession.webRequest.onBeforeRedirect((details) => {
    console.log('Redirect detected:', details.redirectURL);
    
    // Check if this is an OAuth redirect
    const redirectUrl = details.redirectURL;
    const parsedUrl = url.parse(redirectUrl, true);
    
    if (
      (redirectUrl.includes('auth') || 
       redirectUrl.includes('oauth') || 
       redirectUrl.includes('signin') ||
       redirectUrl.includes('login') ||
       redirectUrl.includes('sso') ||
       redirectUrl.includes('callback')) && 
      (parsedUrl.query.token || parsedUrl.query.code || parsedUrl.query.access_token)
    ) {
      console.log('OAuth redirect detected:', redirectUrl);
      
      // Send the URL to the webview to handle OAuth callbacks properly
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('handle-auth-redirect', redirectUrl);
      }
    }
  });

  // Set up permissive session preferences
  mainSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow all permissions
    console.log(`Permission requested: ${permission}`);
    callback(true);
  });
  
  // Handle authentication requests globally
  mainSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Ensure consistent headers for authentication
    callback({ 
      cancel: false,
      requestHeaders: {
        ...details.requestHeaders,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  });
  
  // Use the login event instead of onAuthRequired
  app.on('login', (event, webContents, authInfo, callback) => {
    console.log('Authentication required:', authInfo.url);
    // Auto-allow all auth requests
    event.preventDefault();
    callback();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle IPC events
ipcMain.on('log-url-opened', (event, data) => {
  // Add to URL history
  urlHistory.push(data);
  
  // Could save to a file here if needed
  console.log('URL opened:', data);
});

// Instead of opening a new window, we'll notify to use the embedded browser
ipcMain.on('open-batch', (event, data) => {
  // Respond with a message that external browsers are disabled
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'In-App Browser Only',
    message: 'Please use the embedded browser to view URLs. External browser windows have been disabled.',
    buttons: ['OK']
  });
  
  // Return null to indicate no window was opened
  event.returnValue = null;
});

// Handle PDF download request
ipcMain.on('download-pdf', (event, data) => {
  dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: path.join(app.getPath('downloads'), 'workorder.pdf'),
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      // Here you would implement the PDF generation
      // For now just show a message
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'PDF Download',
        message: `PDF download feature is being implemented. Would save to: ${result.filePath}`,
        buttons: ['OK']
      });
    }
  });
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

// Listen for session errors
app.on('render-process-gone', (event, webContents, details) => {
  console.log('Render process gone:', details.reason);
});

// Handle auth errors
app.on('login', (event, webContents, details, authInfo, callback) => {
  console.log('Login requested for:', authInfo.url);
  console.log('Auth details:', authInfo);
  
  // Auto-allow all auth requests
  event.preventDefault();
  callback();
});

// Block shell.openExternal calls and improve authentication handling
app.on('web-contents-created', (event, contents) => {
  // Handle new webContents creation (includes webviews)
  contents.on('will-navigate', (event, navigateUrl) => {
    console.log('Navigation in webview:', navigateUrl);
    
    // Allow navigation within the webview
    const parsedUrl = url.parse(navigateUrl, true);
    
    // Look for OAuth related URLs
    if (
      (navigateUrl.includes('auth') || 
       navigateUrl.includes('oauth') || 
       navigateUrl.includes('signin') ||
       navigateUrl.includes('login') ||
       navigateUrl.includes('sso') ||
       navigateUrl.includes('callback')) && 
      (parsedUrl.query.token || parsedUrl.query.code || parsedUrl.query.access_token)
    ) {
      console.log('OAuth navigation detected:', navigateUrl);
    }
  });
  
  // Improved handler for new window requests
  contents.setWindowOpenHandler(({ url: openUrl }) => {
    console.log('Attempted to open new window:', openUrl);
    
    // Special handling for authentication redirects
    const parsedUrl = url.parse(openUrl, true);
    if (
      (openUrl.includes('auth') || 
       openUrl.includes('login') || 
       openUrl.includes('sso') || 
       openUrl.includes('oauth') ||
       openUrl.includes('signin') ||
       openUrl.includes('callback')) ||
      (parsedUrl.query.token || parsedUrl.query.code || parsedUrl.query.access_token)
    ) {
      // Send a message to load this URL in the current webview instead
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('handle-auth-redirect', openUrl);
      }
    } else {
      // For non-auth URLs, show the dialog
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'External Browser Disabled',
        message: 'External browser opening has been disabled. Please use the embedded browser only.',
        buttons: ['OK']
      });
    }
    
    // Always deny opening external window
    return { action: 'deny' };
  });

  // Handle session cookies for authentication
  contents.on('did-finish-load', () => {
    // Preserve cookies and session for OAuth
    contents.session.cookies.flushStore().catch(err => {
      console.error('Error flushing cookie store', err);
    });
  });
}); 