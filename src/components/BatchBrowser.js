import React, { useState } from 'react';
import './BatchBrowser.css';

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
      sendSync: (channel, data) => {
        console.log(`Mock IPC sendSync: ${channel}`, data);
        return null;
      }
    }
  };
})();

const BatchBrowser = ({ urls, batchSize, onBatchStart, onBatchComplete, onOpenUrl }) => {
  const [currentBatch, setCurrentBatch] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  
  // Calculate total batches
  const totalBatches = Math.ceil(urls.length / batchSize);
  
  // Get current batch's URLs
  const getCurrentBatchUrls = (batchNum) => {
    const startIndex = (batchNum - 1) * batchSize;
    const endIndex = Math.min(startIndex + batchSize, urls.length);
    return urls.slice(startIndex, endIndex);
  };
  
  // Start processing a specific batch
  const processBatch = (batchNum) => {
    if (batchNum < 1 || batchNum > totalBatches || isProcessing) {
      return;
    }
    
    setIsProcessing(true);
    setCurrentBatch(batchNum);
    setProcessingStatus(`Opening batch ${batchNum} of ${totalBatches}...`);
    
    const batchUrls = getCurrentBatchUrls(batchNum);
    
    // Notify parent component that batch processing started
    if (onBatchStart) {
      onBatchStart(batchNum, batchUrls);
    }
    
    // Open the first URL in the embedded browser
    if (onOpenUrl && batchUrls.length > 0) {
      onOpenUrl(batchUrls[0]);
      setProcessingStatus(`Batch ${batchNum} loaded in embedded browser. Use browser controls to navigate.`);
    } else {
      // Legacy behavior for compatibility - this shouldn't actually open windows anymore
      const windowId = electronAPI.ipcRenderer.sendSync('open-batch', {
        batchId: batchNum,
        urls: batchUrls
      });
      
      if (windowId) {
        setProcessingStatus(`Batch ${batchNum} window opened (Window ID: ${windowId})`);
      } else {
        setProcessingStatus(`Batch ${batchNum} prepared. Using embedded browser to view URLs.`);
      }
    }
    
    setIsProcessing(false);
    
    // Notify parent component that batch processing completed
    if (onBatchComplete) {
      onBatchComplete(batchNum);
    }
  };
  
  // Handle navigation to previous batch
  const handlePrevBatch = () => {
    if (currentBatch > 1) {
      processBatch(currentBatch - 1);
    }
  };
  
  // Handle navigation to next batch
  const handleNextBatch = () => {
    if (currentBatch < totalBatches) {
      processBatch(currentBatch + 1);
    }
  };
  
  // Handle processing a specific batch
  const handleBatchClick = (batchNum) => {
    processBatch(batchNum);
  };
  
  // Generate batch buttons
  const renderBatchButtons = () => {
    const buttons = [];
    
    for (let i = 1; i <= totalBatches; i++) {
      buttons.push(
        <button
          key={i}
          className={`batch-button ${i === currentBatch ? 'active' : ''}`}
          onClick={() => handleBatchClick(i)}
          disabled={isProcessing}
        >
          {i}
        </button>
      );
    }
    
    return buttons;
  };

  return (
    <div className="batch-browser">
      <div className="batch-header">
        <h3>Batch Processing</h3>
        <div className="batch-stats">
          <span>{urls.length} URLs in {totalBatches} batches</span>
          <span>({batchSize} URLs per batch)</span>
        </div>
      </div>
      
      <div className="batch-controls">
        <button 
          className="batch-nav-button"
          onClick={handlePrevBatch}
          disabled={currentBatch === 1 || isProcessing}
        >
          Previous Batch
        </button>
        
        <div className="batch-buttons">
          {renderBatchButtons()}
        </div>
        
        <button 
          className="batch-nav-button"
          onClick={handleNextBatch}
          disabled={currentBatch === totalBatches || isProcessing}
        >
          Next Batch
        </button>
      </div>
      
      {processingStatus && (
        <div className="batch-status">
          {processingStatus}
        </div>
      )}
    </div>
  );
};

export default BatchBrowser; 