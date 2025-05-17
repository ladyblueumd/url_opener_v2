import React, { useState, useEffect, useRef } from 'react';
import './EmbeddedBrowser.css';

// Safely access Electron API
const electronAPI = (() => {
  try {
    // Use window.ipcRenderer directly since we've exposed it in preload.js
    if (window.ipcRenderer) {
      return { ipcRenderer: window.ipcRenderer };
    } else if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return { ipcRenderer };
    }
  } catch (e) {
    console.log("Running outside of Electron environment", e);
  }
  // Return mock implementations when not in Electron
  return {
    ipcRenderer: {
      send: (channel, data) => console.log(`Mock IPC send: ${channel}`, data),
      on: () => {},
      removeListener: () => {}
    }
  };
})();

const EmbeddedBrowser = ({ url, batchId, onNavigate }) => {
  const [currentUrl, setCurrentUrl] = useState(url || '');
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef(null);
  const [isWebviewReady, setIsWebviewReady] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  // Determine if we're in Electron environment
  const isElectron = !!(window.ipcRenderer || window.require);

  useEffect(() => {
    if (url && url !== currentUrl) {
      setCurrentUrl(url);
      if (webviewRef.current && isWebviewReady && webviewRef.current.loadURL) {
        try {
          webviewRef.current.loadURL(url);
        } catch (e) {
          console.error("Error loading URL:", e);
        }
      }
    }
  }, [url, currentUrl, isWebviewReady]);

  // Handle auth redirects from main process
  useEffect(() => {
    // Only set up in Electron environment
    if (!isElectron) return;
    
    const handleAuthRedirect = (event, redirectUrl) => {
      console.log('Auth redirect received:', redirectUrl);
      setAuthInProgress(true);
      
      // Load the auth redirect URL in our webview
      if (webviewRef.current && isWebviewReady && webviewRef.current.loadURL) {
        try {
          webviewRef.current.loadURL(redirectUrl);
          setCurrentUrl(redirectUrl);
        } catch (e) {
          console.error("Error loading redirect URL:", e);
        }
      }
    };
    
    // Listen for auth redirect messages
    electronAPI.ipcRenderer.on('handle-auth-redirect', handleAuthRedirect);
    
    // Clean up listener
    return () => {
      electronAPI.ipcRenderer.removeListener('handle-auth-redirect', handleAuthRedirect);
    };
  }, [isElectron, isWebviewReady]);

  useEffect(() => {
    if (!isElectron) {
      setTitle("Embedded browser view - only available in Electron app");
      return;
    }

    // Wait for the webview to be ready
    const webview = webviewRef.current;
    if (!webview) return;
    
    const handleWebviewReady = () => {
      console.log("Webview is ready");
      setIsWebviewReady(true);
      
      // Configure webview for better OAuth handling
      if (webview.getWebContentsId) {
        try {
          // Enable persistent cookies and session
          webview.partition = `persist:authSession`;
          
          // Execute the session configuration in the webview
          webview.executeJavaScript(`
            try {
              // Ensure third-party cookies are enabled
              document.cookie = "thirdPartyCookiesEnabled=1; SameSite=None; Secure";
              
              // Configure localStorage for better auth persistence
              localStorage.setItem('authEnabled', 'true');
              
              console.log("Cookie and session settings configured");
            } catch(e) {
              console.error("Error configuring cookies:", e);
            }
          `);
        } catch (e) {
          console.error("Error configuring webview:", e);
        }
      }
      
      // If we have a URL, load it
      if (currentUrl && webview.loadURL) {
        try {
          webview.loadURL(currentUrl);
        } catch (e) {
          console.error("Error loading initial URL:", e);
        }
      }
    };
    
    // Check if webview is already ready
    if (webview.getWebContentsId) {
      setIsWebviewReady(true);
    } else {
      // Wait for dom-ready event
      webview.addEventListener('dom-ready', handleWebviewReady);
    }
    
    return () => {
      if (webview) {
        webview.removeEventListener('dom-ready', handleWebviewReady);
      }
    };
  }, [isElectron, currentUrl]);
  
  // Setup webview event listeners after it's ready
  useEffect(() => {
    if (!isElectron || !isWebviewReady) return;
    
    const webview = webviewRef.current;
    if (!webview || !webview.addEventListener) return;

    const handleDidStartLoading = () => {
      setIsLoading(true);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
      
      // Check for auth-related redirects by looking at the final URL
      const finalUrl = webview.getURL();
      if (authInProgress && (
        finalUrl.includes('callback') || 
        finalUrl.includes('token') || 
        finalUrl.includes('auth') ||
        finalUrl.includes('code') ||
        finalUrl.includes('access_token')
      )) {
        console.log('Potential OAuth callback URL:', finalUrl);
        
        // Try to extract tokens or authorization codes from the URL
        try {
          const urlObj = new URL(finalUrl);
          const params = new URLSearchParams(urlObj.search);
          const hashParams = new URLSearchParams(urlObj.hash ? urlObj.hash.substring(1) : '');
          
          // Log potential auth tokens for debugging
          if (params.get('code') || params.get('token') || 
              params.get('access_token') || hashParams.get('access_token')) {
            console.log('Auth token detected in URL');
            // Signal that auth was successful
            setAuthInProgress(false);
          }
        } catch (e) {
          console.error('Error parsing auth URL:', e);
        }
      }
      
      // Log the URL opening with timestamp
      const timestamp = new Date().toISOString();
      electronAPI.ipcRenderer.send('log-url-opened', { 
        url: webview.getURL(), 
        timestamp, 
        batchId 
      });
    };

    const handleDidFinishLoad = () => {
      setTitle(webview.getTitle());
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      setCurrentUrl(webview.getURL());
      
      // Notify parent component about navigation
      if (onNavigate) {
        onNavigate(webview.getURL());
      }
      
      // Inject script to handle redirects and authentication
      try {
        webview.executeJavaScript(`
          if (!window._redirectHandlerInjected) {
            window._redirectHandlerInjected = true;
            
            // Capture and log all redirects
            (function() {
              // Intercept window.open
              const originalOpen = window.open;
              window.open = function(url) {
                console.log('Intercepted window.open:', url);
                // Cancel the original open
                return null;
              };
              
              // Handle form submissions
              document.addEventListener('submit', function(e) {
                console.log('Form submission detected:', e.target.action);
              });
              
              // Intercept fetch requests for potential auth flows
              const originalFetch = window.fetch;
              window.fetch = function(url, options) {
                console.log('Fetch intercepted:', url);
                return originalFetch(url, options);
              };
              
              // Ensure localStorage is available for auth tokens
              try {
                localStorage.setItem('auth_test', 'true');
                localStorage.removeItem('auth_test');
              } catch (e) {
                console.error('LocalStorage not available:', e);
              }
              
              // Monitor for OAuth-related objects in window
              const checkForAuthObjects = () => {
                if (window.token || window.accessToken || window.OAuth) {
                  console.log('Auth object detected in window');
                }
              };
              setTimeout(checkForAuthObjects, 1000);
              
              // Monitor URL changes that might indicate auth callbacks
              let lastUrl = location.href;
              const urlObserver = setInterval(() => {
                if (location.href !== lastUrl) {
                  console.log('URL changed:', location.href);
                  lastUrl = location.href;
                  
                  // Check for auth-related parameters
                  if (location.href.includes('token=') || 
                      location.href.includes('code=') ||
                      location.href.includes('access_token=')) {
                    console.log('Auth parameter detected in URL change');
                  }
                }
              }, 500);
            })();
            
            console.log('Enhanced redirect and auth handler injected');
          }
        `);
      } catch (e) {
        console.error("Error injecting script:", e);
      }
    };

    const handleWillNavigate = (e) => {
      console.log('Will navigate to:', e.url);
      setCurrentUrl(e.url);
      
      // Check if this is an OAuth-related URL
      if (e.url.includes('oauth') || 
          e.url.includes('auth') || 
          e.url.includes('login') ||
          e.url.includes('sso')) {
        console.log('Navigating to potential auth URL');
        setAuthInProgress(true);
      }
    };

    const handleNewWindow = (e) => {
      // Prevent default behavior
      e.preventDefault();
      
      const url = e.url;
      console.log('New window requested for URL:', url);
      
      // Check if it's an auth/login URL
      if (url.includes('auth') || 
          url.includes('login') || 
          url.includes('sso') || 
          url.includes('oauth') ||
          url.includes('callback')) {
        console.log('Auth URL detected in new window request');
        setAuthInProgress(true);
        
        // Load the auth URL in our current webview
        if (webview.loadURL) {
          try {
            webview.loadURL(url);
            setCurrentUrl(url);
          } catch (e) {
            console.error("Error loading new window URL:", e);
          }
        }
      }
    };
    
    const handleConsoleMessage = (e) => {
      console.log('Webview console:', e.message);
    };
    
    const handlePermissionRequest = (e) => {
      e.preventDefault();
      console.log('Permission requested:', e.permission);
      // Auto-approve all permission requests
      if (e.permission === 'media' || 
          e.permission === 'geolocation' ||
          e.permission === 'notifications' ||
          e.permission === 'fullscreen') {
        e.request.grant();
      }
    };

    // Add event listeners
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('will-navigate', handleWillNavigate);
    webview.addEventListener('new-window', handleNewWindow);
    webview.addEventListener('console-message', handleConsoleMessage);
    webview.addEventListener('permission-request', handlePermissionRequest);

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('will-navigate', handleWillNavigate);
      webview.removeEventListener('new-window', handleNewWindow);
      webview.removeEventListener('console-message', handleConsoleMessage);
      webview.removeEventListener('permission-request', handlePermissionRequest);
    };
  }, [batchId, onNavigate, isElectron, isWebviewReady, authInProgress]);

  // Add a new event handler for loading errors
  useEffect(() => {
    if (!isElectron || !isWebviewReady) return;
    
    const webview = webviewRef.current;
    if (!webview || !webview.addEventListener) return;
    
    const handleLoadFailed = (e) => {
      console.log('Webview load failed:', e.errorCode, e.errorDescription, e.validatedURL);
      
      // For authentication-related errors, these are often temporary during redirects
      if (authInProgress) {
        console.log('Auth in progress, ignoring load error');
        return;
      }
      
      // For other errors, we might want to show a message to the user
      if (e.errorCode !== -3) { // -3 is ERR_ABORTED which is common during redirects
        setTitle(`Error loading page: ${e.errorDescription}`);
      }
    };
    
    // Add event listener for load errors
    webview.addEventListener('did-fail-load', handleLoadFailed);
    
    return () => {
      webview.removeEventListener('did-fail-load', handleLoadFailed);
    };
  }, [isElectron, isWebviewReady, authInProgress]);

  const handleGoBack = () => {
    if (webviewRef.current && webviewRef.current.goBack) {
      webviewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webviewRef.current && webviewRef.current.goForward) {
      webviewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (webviewRef.current && webviewRef.current.reload) {
      webviewRef.current.reload();
    }
  };

  const handleOpenExternal = () => {
    if (currentUrl) {
      // Instead of opening externally, we'll load in the current browser
      if (webviewRef.current && webviewRef.current.loadURL) {
        webviewRef.current.loadURL(currentUrl);
      }
      // No longer send open-external message
      // electronAPI.ipcRenderer.send('open-external', currentUrl);
    }
  };

  const handleDownload = () => {
    if (currentUrl) {
      electronAPI.ipcRenderer.send('download-pdf', { url: currentUrl });
    }
  };

  const handleUrlChange = (e) => {
    setCurrentUrl(e.target.value);
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (webviewRef.current && webviewRef.current.loadURL && currentUrl) {
      webviewRef.current.loadURL(currentUrl);
    }
  };

  return (
    <div className="embedded-browser">
      <div className="browser-toolbar">
        <button 
          className="toolbar-button" 
          onClick={handleGoBack} 
          disabled={!canGoBack || !isElectron}
        >
          &larr;
        </button>
        <button 
          className="toolbar-button" 
          onClick={handleGoForward} 
          disabled={!canGoForward || !isElectron}
        >
          &rarr;
        </button>
        <button 
          className="toolbar-button" 
          onClick={handleRefresh}
          disabled={!isElectron}
        >
          ↻
        </button>
        
        <form className="url-form" onSubmit={handleUrlSubmit}>
          <input 
            type="text" 
            className="url-input"
            value={currentUrl} 
            onChange={handleUrlChange}
            placeholder="Enter URL"
          />
        </form>
        
        <button 
          className="toolbar-button" 
          onClick={handleOpenExternal} 
          title="Reload current URL"
          disabled={!isElectron}
        >
          ↻
        </button>
        
        <button 
          className="toolbar-button" 
          onClick={handleDownload} 
          title="Download content"
          disabled={!isElectron}
        >
          ⬇️
        </button>
      </div>
      
      <div className="browser-title-bar">
        {isLoading ? 'Loading...' : title}
      </div>
      
      <div className="webview-container">
        {isElectron ? (
          <webview
            ref={webviewRef}
            src={url}
            className="webview"
            partition="persist:authSession"
            webpreferences="allowRunningInsecureContent=yes, javascript=yes, plugins=yes, nodeIntegration=no, webviewTag=yes, contextIsolation=no"
            allowpopups="true"
            disablewebsecurity="true"
            nodeintegration="false"
            plugins="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            httpreferrer="https://app.fieldnation.com/"
          />
        ) : (
          <div className="browser-fallback">
            <div className="fallback-message">
              <h3>Embedded Browser Preview</h3>
              <p>This feature requires running the Electron app.</p>
              <p>URL: {currentUrl || "No URL provided"}</p>
              <p>In development mode, you can use: <code>npm run electron</code></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmbeddedBrowser; 