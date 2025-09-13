// content.js - Extracts transcript from YouTube videos

class YouTubeTranscriptExtractor {
  constructor() {
    this.transcript = null;
    this.observers = [];
  }

  // Extract transcript text from YouTube's transcript panel
  async extractTranscript() {
    try {
      // First, try to open the transcript panel if it's not already open
      await this.openTranscriptPanel();
      
      // Wait a bit for the transcript to load
      await this.sleep(2000);

      // Get transcript items
      const transcriptItems = document.querySelectorAll(
        'ytd-transcript-segment-renderer .segment-text, ' +
        '[data-testid="transcript-segment"] .segment-text, ' +
        '.ytd-transcript-segment-renderer .cue-group-start-offset'
      );

      if (transcriptItems.length === 0) {
        // Try alternative selectors
        const altItems = document.querySelectorAll(
          '.segment-text, .ytp-transcript-content-segment, .transcript-segment'
        );
        
        if (altItems.length === 0) {
          throw new Error('No transcript found on this page');
        }
        
        return Array.from(altItems).map(item => item.textContent.trim()).join(' ');
      }

      // Extract and clean transcript text
      const transcriptText = Array.from(transcriptItems)
        .map(item => item.textContent.trim())
        .filter(text => text.length > 0)
        .join(' ');

      return transcriptText;
    } catch (error) {
      console.error('Error extracting transcript:', error);
      throw error;
    }
  }

  // Try to open the transcript panel
  async openTranscriptPanel() {
    // Look for the "Show transcript" button
    const transcriptButton = document.querySelector(
      '[aria-label*="transcript" i], [aria-label*="Show transcript" i], ' +
      'button[title*="transcript" i], yt-button-renderer[aria-label*="transcript" i]'
    );

    if (transcriptButton && !this.isTranscriptPanelOpen()) {
      transcriptButton.click();
      await this.sleep(1000);
    }

    // Alternative: Look in the description area for transcript toggle
    const moreActionsButton = document.querySelector(
      'ytd-menu-renderer button[aria-label*="More actions" i]'
    );
    
    if (moreActionsButton && !this.isTranscriptPanelOpen()) {
      moreActionsButton.click();
      await this.sleep(500);
      
      const transcriptMenuItem = document.querySelector(
        '[role="menuitem"] tp-yt-paper-item:has-text("Show transcript"), ' +
        '[role="menuitem"]:has-text("transcript")'
      );
      
      if (transcriptMenuItem) {
        transcriptMenuItem.click();
        await this.sleep(1000);
      }
    }
  }

  // Check if transcript panel is currently open
  isTranscriptPanelOpen() {
    return document.querySelector(
      'ytd-transcript-renderer, #transcript, .transcript-container'
    ) !== null;
  }

  // Get transcript using YouTube's internal API (alternative method)
  async getTranscriptFromAPI() {
    try {
      const videoId = this.getVideoId();
      if (!videoId) {
        throw new Error('Could not find video ID');
      }

      // This is a fallback method - may not always work due to CORS
      const response = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`);
      if (response.ok) {
        const data = await response.json();
        if (data.events) {
          return data.events
            .filter(event => event.segs)
            .map(event => event.segs.map(seg => seg.utf8).join(''))
            .join(' ');
        }
      }
    } catch (error) {
      console.warn('API method failed:', error);
    }
    return null;
  }

  // Extract video ID from URL
  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Helper function to sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get video title
  getVideoTitle() {
    const titleElement = document.querySelector(
      'h1.ytd-video-primary-info-renderer, ' +
      'h1.style-scope.ytd-video-primary-info-renderer, ' +
      '#title h1, ytd-video-primary-info-renderer h1'
    );
    return titleElement ? titleElement.textContent.trim() : 'Unknown Video';
  }

  // Get video URL
  getVideoUrl() {
    return window.location.href;
  }

  // Clean up observers
  disconnect() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Initialize the extractor
const transcriptExtractor = new YouTubeTranscriptExtractor();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractTranscript') {
    transcriptExtractor.extractTranscript()
      .then(transcript => {
        sendResponse({
          success: true,
          transcript: transcript,
          videoTitle: transcriptExtractor.getVideoTitle(),
          videoUrl: transcriptExtractor.getVideoUrl(),
          videoId: transcriptExtractor.getVideoId()
        });
      })
      .catch(error => {
        // Try the API method as fallback
        transcriptExtractor.getTranscriptFromAPI()
          .then(apiTranscript => {
            if (apiTranscript) {
              sendResponse({
                success: true,
                transcript: apiTranscript,
                videoTitle: transcriptExtractor.getVideoTitle(),
                videoUrl: transcriptExtractor.getVideoUrl(),
                videoId: transcriptExtractor.getVideoId(),
                method: 'api'
              });
            } else {
              sendResponse({
                success: false,
                error: error.message || 'Could not extract transcript'
              });
            }
          })
          .catch(apiError => {
            sendResponse({
              success: false,
              error: `${error.message}. API fallback also failed: ${apiError.message}`
            });
          });
      });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }

  if (request.action === 'checkTranscriptAvailability') {
    const hasTranscriptButton = document.querySelector(
      '[aria-label*="transcript" i], button[title*="transcript" i]'
    ) !== null;
    
    sendResponse({
      available: hasTranscriptButton,
      videoId: transcriptExtractor.getVideoId(),
      videoTitle: transcriptExtractor.getVideoTitle()
    });
  }
});

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
  transcriptExtractor.disconnect();
});