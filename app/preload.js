
      // Preload script to expose Electron APIs to renderer process
      const { contextBridge, ipcRenderer } = require('electron');
      
      // Expose the ipcRenderer to the window object
      window.ipcRenderer = ipcRenderer;
    