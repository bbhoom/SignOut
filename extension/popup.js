// Global variables to store transcript data
let currentTranscript = null;
let currentVideoInfo = null;

// Extract Transcript functionality
document.getElementById('extractTranscript').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const transcriptContainer = document.getElementById('transcriptContainer');
  const transcriptText = document.getElementById('transcriptText');
  const videoInfo = document.getElementById('videoInfo');

  statusDiv.innerText = "Checking if this is a YouTube video...";
  transcriptContainer.classList.add('hidden');
  videoInfo.classList.add('hidden');

  // Get the current tab
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url;

  if (!url.includes("youtube.com/watch")) {
    statusDiv.innerText = "❌ Not a YouTube video page! Please navigate to a YouTube video.";
    return;
  }

  statusDiv.innerText = "🔍 Extracting transcript from YouTube video...";

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

      statusDiv.innerText = "✅ Transcript extracted successfully!";
      
      // Show video info
      videoInfo.innerHTML = `<strong>Video:</strong> ${response.videoTitle}<br><strong>ID:</strong> ${response.videoId}`;
      videoInfo.classList.remove('hidden');

      // Show transcript
      transcriptText.innerText = response.transcript;
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

      // Enable the ASL button if it was disabled
      document.getElementById('getASL').disabled = false;

    } else {
      statusDiv.innerText = `❌ Error: ${response.error}`;
      transcriptContainer.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error extracting transcript:', error);
    statusDiv.innerText = "❌ Error communicating with the page. Please refresh and try again.";
  }
});

// Get ASL Video functionality (updated)
document.getElementById('getASL').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const videoContainer = document.getElementById('videoContainer');
  
  statusDiv.innerText = "Getting current tab URL...";
  videoContainer.innerHTML = "";

  // Get the current tab's URL
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url;

  if (!url.includes("youtube.com/watch")) {
    statusDiv.innerText = "❌ Not a YouTube video page!";
    return;
  }

  statusDiv.innerText = "🎬 Requesting 3D ASL rendering...";

  // Send the URL to your backend
  try {
    const response = await fetch("http://127.0.0.1:5000/asl_from_youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();

    if (response.ok && data.url) {
      statusDiv.innerText = "✅ 3D ASL video ready!";
      videoContainer.innerHTML = `
        <video controls src="http://127.0.0.1:5000${data.url}"></video>
        <a href="http://127.0.0.1:5000${data.url}" download="asl.mp4" class="download-link">📥 Download Video</a>
      `;
    } else {
      statusDiv.innerText = `❌ ${data.error || "Error generating video."}`;
    }
  } catch (e) {
    statusDiv.innerText = "❌ Backend not reachable! Make sure your Flask server is running on port 5000.";
    console.error('Backend error:', e);
  }
});

// Copy transcript to clipboard functionality
function copyTranscriptToClipboard() {
  if (currentTranscript) {
    navigator.clipboard.writeText(currentTranscript).then(() => {
      const statusDiv = document.getElementById('status');
      const originalText = statusDiv.innerText;
      statusDiv.innerText = "📋 Transcript copied to clipboard!";
      setTimeout(() => {
        statusDiv.innerText = originalText;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy transcript:', err);
    });
  }
}

// Add copy button functionality when transcript is shown
document.addEventListener('DOMContentLoaded', () => {
  // Add copy button to transcript container
  const transcriptContainer = document.getElementById('transcriptContainer');
  const copyButton = document.createElement('button');
  copyButton.innerText = '📋 Copy Transcript';
  copyButton.style.marginTop = '10px';
  copyButton.style.padding = '5px 10px';
  copyButton.style.fontSize = '12px';
  copyButton.style.backgroundColor = '#6c757d';
  copyButton.style.color = 'white';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '3px';
  copyButton.style.cursor = 'pointer';
  copyButton.addEventListener('click', copyTranscriptToClipboard);
  
  transcriptContainer.appendChild(copyButton);
});

// Initialize - check if we're on a YouTube page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    // Try to load cached transcript if available
    const videoId = new URLSearchParams(new URL(tab.url).search).get('v');
    if (videoId) {
      chrome.storage.local.get(`transcript_${videoId}`, (result) => {
        const cached = result[`transcript_${videoId}`];
        if (cached && (Date.now() - cached.timestamp) < 3600000) { // 1 hour cache
          document.getElementById('status').innerText = "💾 Found cached transcript (click Extract to refresh)";
        }
      });
    }
  } else {
    document.getElementById('status').innerText = "ℹ️ Navigate to a YouTube video to use this extension";
    document.getElementById('extractTranscript').disabled = true;
    document.getElementById('getASL').disabled = true;
  }
});
