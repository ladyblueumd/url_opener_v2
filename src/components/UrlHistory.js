import React, { useState, useEffect } from 'react';
import './UrlHistory.css';

// Safely access Electron API
const electronAPI = (() => {
  try {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      return { ipcRenderer };
    }
  } catch (e) {
    console.log("Running outside of Electron environment");
  }
  // Return mock implementations when not in Electron
  return {
    ipcRenderer: {
      invoke: async () => {
        console.log('Mock invoke: get-opened-urls');
        return []; // Return empty array in web browser mode
      },
      send: (channel, data) => console.log(`Mock IPC send: ${channel}`, data)
    }
  };
})();

const UrlHistory = ({ onOpenUrl }) => {
  const [urlHistory, setUrlHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);
  
  // Check if we're running in Electron
  const isElectron = (() => {
    try {
      return !!window.require;
    } catch (e) {
      return false;
    }
  })();

  useEffect(() => {
    // Load URL history from electron store
    const loadHistory = async () => {
      try {
        setIsLoading(true);
        
        if (isElectron) {
          const history = await electronAPI.ipcRenderer.invoke('get-opened-urls');
          setUrlHistory(history || []);
        } else {
          // In browser mode, we'll use some sample data
          setUrlHistory([
            {
              url: 'https://app.fieldnation.com/workorders/sample1',
              timestamp: new Date().toISOString(),
              batchId: 1
            },
            {
              url: 'https://app.fieldnation.com/workorders/sample2',
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              batchId: 1
            }
          ]);
          
          // Short delay to simulate loading
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('Failed to load URL history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [isElectron]);

  // Filter and sort the URL history
  const filteredAndSortedHistory = urlHistory
    .filter(item => 
      item.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.batchId && item.batchId.toString().includes(searchTerm))
    )
    .sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      
      return sortOrder === 'newest' 
        ? dateB - dateA 
        : dateA - dateB;
    });

  // Format the date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle sort order change
  const handleSortChange = (e) => {
    setSortOrder(e.target.value);
  };

  // Handle open URL in embedded browser
  const handleOpenUrl = (url) => {
    if (onOpenUrl) {
      // Use the provided handler to open in embedded browser
      onOpenUrl(url);
    } else if (isElectron) {
      // Fallback to opening in Electron (should be disabled by main process)
      electronAPI.ipcRenderer.send('open-external', url);
    } else {
      // Fallback for browser mode - will be a popup, but this is just for dev mode
      window.open(url, '_blank');
    }
  };

  return (
    <div className="url-history">
      {!isElectron && (
        <div className="browser-mode-notice">
          <p>Running in browser mode. Limited functionality available.</p>
          <p>For full functionality, run the Electron app.</p>
        </div>
      )}
      
      <div className="history-header">
        <h2>URL Access History</h2>
        
        <div className="history-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search URLs..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
            />
          </div>
          
          <div className="sort-container">
            <select 
              value={sortOrder} 
              onChange={handleSortChange}
              className="sort-select"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading-message">Loading history...</div>
      ) : filteredAndSortedHistory.length === 0 ? (
        <div className="empty-message">
          {searchTerm ? 'No matching URLs found.' : 'No URL history available.'}
        </div>
      ) : (
        <div className="history-list">
          <table className="history-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Batch</th>
                <th>Date & Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedHistory.map((item, index) => (
                <tr key={index} className="history-item">
                  <td className="url-cell">
                    <div className="url-text">{item.url}</div>
                  </td>
                  <td className="batch-cell">{item.batchId || 'N/A'}</td>
                  <td className="timestamp-cell">{formatDate(item.timestamp)}</td>
                  <td className="actions-cell">
                    <button 
                      className="action-button"
                      onClick={() => handleOpenUrl(item.url)}
                      title="Open in embedded browser"
                    >
                      🔍
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UrlHistory; 