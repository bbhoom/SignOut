// Global variables to store transcript data
let currentTranscript = null;
let currentVideoInfo = null;

// Extract Transcript functionality
document.getElementById('extractTranscript').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const transcriptContainer = document.getElementById('transcriptContainer');
  const transcriptText = document.getElementById('transcriptText');
  const videoInfo = document.getElementById('videoInfo');
  const wordCount = document.getElementById('wordCount');

  // Reset UI state
  statusDiv.className = '';
  statusDiv.innerText = "Checking if this is a YouTube video...";
  transcriptContainer.classList.add('hidden');
  videoInfo.classList.add('hidden');

  // Get the current tab
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url;

  if (!url.includes("youtube.com/watch")) {
    statusDiv.className = 'error';
    statusDiv.innerText = "Not a YouTube video page! Please navigate to a YouTube video.";
    return;
  }

  statusDiv.innerText = "Extracting transcript from YouTube video...";

  try {
    // Send message to content script to extract transcript
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' });

    if (response.success) {
      currentTranscript = response.transcript;
      currentVideoInfo = {
        title: response.videoTitle,
        url: response.videoUrl,
        id: response.videoId
      };

      statusDiv.className = 'success';
      statusDiv.innerText = "Transcript extracted successfully!";
      
      // Show video info
      videoInfo.innerHTML = `<strong>Video:</strong> ${response.videoTitle}<br><strong>Video ID:</strong> ${response.videoId}`;
      videoInfo.classList.remove('hidden');

      // Show transcript
      transcriptText.innerText = response.transcript;
      
      // Show word count
      const words = response.transcript.trim().split(/\s+/).length;
      const chars = response.transcript.length;
      wordCount.innerText = `${words} words, ${chars} characters`;
      
      transcriptContainer.classList.remove('hidden');

      // Store transcript in Chrome storage for potential reuse
      chrome.storage.local.set({
        [`transcript_${response.videoId}`]: {
          transcript: response.transcript,
          title: response.videoTitle,
          url: response.videoUrl,
          timestamp: Date.now()
        }
      });

      // Save transcript to local JSON file
      saveTranscriptToFile({
        videoId: response.videoId,
        title: response.videoTitle,
        url: response.videoUrl,
        transcript: response.transcript,
        timestamp: new Date().toISOString(),
        extractedAt: new Date().toLocaleString()
      });

    } else {
      statusDiv.className = 'error';
      statusDiv.innerText = `Error: ${response.error}`;
      transcriptContainer.classList.add('hidden');
      videoInfo.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error extracting transcript:', error);
    statusDiv.className = 'error';
    statusDiv.innerText = "Error communicating with the page. Please refresh and try again.";
  }
});

// Save transcript to local JSON file
function saveTranscriptToFile(transcriptData) {
  try {
    // Create a comprehensive transcript object
    const transcriptObject = {
      videoId: transcriptData.videoId,
      title: transcriptData.title,
      url: transcriptData.url,
      transcript: transcriptData.transcript,
      wordCount: transcriptData.transcript.trim().split(/\s+/).length,
      characterCount: transcriptData.transcript.length,
      extractedAt: transcriptData.extractedAt,
      timestamp: transcriptData.timestamp
    };

    // Convert to JSON string with proper formatting
    const jsonString = JSON.stringify(transcriptObject, null, 2);
    
    // Create a blob with the JSON data
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.json';
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    console.log('Transcript saved to transcript.json');
  } catch (error) {
    console.error('Error saving transcript to file:', error);
  }
}

// Copy transcript to clipboard functionality
function copyTranscriptToClipboard() {
  if (currentTranscript) {
    navigator.clipboard.writeText(currentTranscript).then(() => {
      const copyButton = document.getElementById('copyButton');
      const originalText = copyButton.innerText;
      copyButton.innerText = "Copied!";
      copyButton.style.background = "linear-gradient(135deg, var(--persian-green), var(--charcoal))";
      
      setTimeout(() => {
        copyButton.innerText = originalText;
        copyButton.style.background = "linear-gradient(135deg, var(--sandy-brown), var(--burnt-sienna))";
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy transcript:', err);
      const copyButton = document.getElementById('copyButton');
      copyButton.innerText = "Failed";
      copyButton.style.background = "linear-gradient(135deg, var(--burnt-sienna), var(--sandy-brown))";
      
      setTimeout(() => {
        copyButton.innerText = "Copy";
        copyButton.style.background = "linear-gradient(135deg, var(--sandy-brown), var(--burnt-sienna))";
      }, 2000);
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Add event listener to copy button
  document.getElementById('copyButton').addEventListener('click', copyTranscriptToClipboard);
  
  // Add event listener to download button
  document.getElementById('downloadButton').addEventListener('click', () => {
    if (currentTranscript && currentVideoInfo) {
      saveTranscriptToFile({
        videoId: currentVideoInfo.id,
        title: currentVideoInfo.title,
        url: currentVideoInfo.url,
        transcript: currentTranscript,
        timestamp: new Date().toISOString(),
        extractedAt: new Date().toLocaleString()
      });
    }
  });
  
  // Check if we're on a YouTube page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      // Try to load cached transcript if available
      const videoId = new URLSearchParams(new URL(tab.url).search).get('v');
      if (videoId) {
        chrome.storage.local.get(`transcript_${videoId}`, (result) => {
          const cached = result[`transcript_${videoId}`];
          if (cached && (Date.now() - cached.timestamp) < 3600000) { // 1 hour cache
            document.getElementById('status').innerText = "Found cached transcript (click Extract to refresh)";
            
            // Optionally load the cached transcript
            currentTranscript = cached.transcript;
            currentVideoInfo = {
              title: cached.title,
              url: cached.url,
              id: videoId
            };
          }
        });
      }
    } else {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'error';
      statusDiv.innerText = "Navigate to a YouTube video to use this extension";
      document.getElementById('extractTranscript').disabled = true;
    }
  });
});

// Handle extension icon click to refresh if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    // Re-enable the button if we're on a YouTube video page
    const extractButton = document.getElementById('extractTranscript');
    if (extractButton) {
      extractButton.disabled = false;
      const statusDiv = document.getElementById('status');
      statusDiv.className = '';
      statusDiv.innerText = "Ready to extract transcript from YouTube video";
    }
  }
});
