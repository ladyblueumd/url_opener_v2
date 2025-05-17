import React, { useEffect, useState } from 'react';

/**
 * DevHelper component provides development-specific information and controls
 * This component is only visible in development mode
 */
const DevHelper = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const isDev = process.env.NODE_ENV === 'development';
  
  useEffect(() => {
    // Only run in development mode
    if (!isDev) return;
    
    // Check WebSocket connection status
    const checkWebSocketConnection = () => {
      try {
        const ws = new WebSocket('ws://localhost:3000/ws');
        
        ws.onopen = () => {
          setConnectionStatus('connected');
          ws.close();
        };
        
        ws.onerror = () => {
          setConnectionStatus('disconnected');
        };
      } catch (e) {
        setConnectionStatus('disconnected');
      }
    };
    
    // Initial check
    checkWebSocketConnection();
    
    // Periodically check connection - reduced frequency to avoid console spam
    const interval = setInterval(checkWebSocketConnection, 30000); // Check every 30 seconds instead of 10
    
    return () => clearInterval(interval);
  }, [isDev]);
  
  // Don't render anything in production
  if (!isDev) return null;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: isVisible ? '0' : '-280px',
      right: '10px',
      width: '300px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: '5px 5px 0 0',
      padding: '10px',
      transition: 'bottom 0.3s ease-in-out',
      zIndex: 9999,
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      boxShadow: '0 0 10px rgba(0,0,0,0.2)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderBottom: '1px solid #ccc',
        paddingBottom: '5px',
        marginBottom: '5px'
      }}>
        <h3 style={{ margin: '0', fontSize: '14px' }}>Development Helper</h3>
        <button 
          onClick={() => setIsVisible(!isVisible)} 
          style={{ 
            border: 'none', 
            background: 'none', 
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          {isVisible ? '▼' : '▲'}
        </button>
      </div>
      
      <div style={{ display: isVisible ? 'block' : 'none' }}>
        <p style={{ fontSize: '12px', margin: '5px 0' }}>
          <strong>Mode:</strong> Development
        </p>
        
        <p style={{ fontSize: '12px', margin: '5px 0' }}>
          <strong>Hot Reload:</strong>{' '}
          <span style={{
            color: connectionStatus === 'connected' ? 'green' : 'red',
            fontWeight: 'bold'
          }}>
            {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </p>
        
        <div style={{ 
          border: '1px solid #e0e0e0', 
          padding: '5px', 
          marginTop: '5px',
          backgroundColor: '#ffffd9'
        }}>
          <p style={{ fontSize: '12px', margin: '0 0 5px 0', fontWeight: 'bold' }}>Security Warnings</p>
          <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '11px' }}>
            <li>webSecurity disabled - <span style={{ color: 'blue' }}>Required for OAuth</span></li>
            <li>allowRunningInsecureContent - <span style={{ color: 'blue' }}>Required for mixed content</span></li>
            <li>Insecure CSP - <span style={{ color: 'blue' }}>Required for embedded browser</span></li>
          </ul>
          <p style={{ fontSize: '11px', margin: '5px 0 0 0', fontStyle: 'italic' }}>
            These warnings are intentional for development and will not appear in production.
          </p>
        </div>
        
        <div style={{ fontSize: '11px', marginTop: '10px' }}>
          <p style={{ margin: '0', fontWeight: 'bold' }}>WebSocket Tips:</p>
          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
            <li>If hot reload is disconnected, try restarting the app</li>
            <li>Changes to Electron.js require a full restart</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DevHelper; 