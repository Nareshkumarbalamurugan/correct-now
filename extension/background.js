/**
 * CorrectNow Background Service Worker (Manifest V3)
 * Handles API communication for grammar checking with multi-language support
 * - Receives messages from content.js
 * - Makes API calls to the grammar checking backend
 * - Returns structured error responses
 */

console.log('🔧 CorrectNow Service Worker loaded');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);
  console.log('📍 From:', sender.url);

  if (request.action === 'checkGrammar') {
    // Handle async with promise
    handleGrammarCheck(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Unhandled error:', error);
        sendResponse({
          error: error.message || 'Unknown error occurred',
          details: error.toString(),
        });
      });
    // Return true to indicate async response
    return true;
  } else if (request.action === 'getAuthState') {
    // Get stored authentication state
    getAuthState()
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Error getting auth state:', error);
        sendResponse(null);
      });
    return true;
  } else if (request.action === 'getUserStats') {
    // Get user usage statistics
    getUserStats()
      .then(sendResponse)
      .catch(error => {
        console.error('❌ Error getting user stats:', error);
        sendResponse(null);
      });
    return true;
  } else if (request.action === 'logout') {
    // Logout user
    logout()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('❌ Error logging out:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'saveAuthToken') {
    // Save Firebase auth token
    saveAuthToken(request.token, request.user)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('❌ Error saving auth token:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Check if token needs refresh and request new one if needed
 */
async function checkAndRefreshToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser', 'tokenExpiresAt'], async (result) => {
      const { authToken, authUser, tokenExpiresAt } = result;
      
      // No token stored, nothing to refresh
      if (!authToken || !authUser) {
        resolve();
        return;
      }
      
      // Check if token is expired or will expire soon (within 5 minutes)
      const now = Date.now();
      const expiresAt = tokenExpiresAt || 0;
      const willExpireSoon = expiresAt - now < (5 * 60 * 1000); // Less than 5 minutes left
      
      if (!willExpireSoon) {
        console.log('✅ Token is still valid');
        resolve();
        return;
      }
      
      console.log('⚠️ Token will expire soon, requesting refresh...');
      
      // Try to get a fresh token from the website
      try {
        const response = await fetch('https://correctnow.app/api/refresh-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            console.log('✅ Token refreshed successfully');
            await saveAuthToken(data.token, authUser);
          }
        } else {
          console.warn('⚠️ Could not refresh token, will prompt login when needed');
        }
      } catch (error) {
        console.warn('⚠️ Token refresh failed:', error.message);
      }
      
      resolve();
    });
  });
}

/**
 * Get stored authentication state
 */
async function getAuthState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser'], (result) => {
      if (result.authToken && result.authUser) {
        resolve({
          token: result.authToken,
          user: result.authUser
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Get user usage statistics from backend
 */
async function getUserStats() {
  try {
    // Check and refresh token if needed
    await checkAndRefreshToken();
    
    const authState = await getAuthState();
    
    if (!authState || !authState.token) {
      return {
        planType: 'free',
        dailyChecksUsed: 0,
        dailyLimit: 5,
        creditsRemaining: null
      };
    }

    // Fetch stats from backend
    const response = await fetch('https://correctnow.app/api/user/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authState.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Check if token expired (401 or 403)
      if (response.status === 401 || response.status === 403) {
        console.warn('Auth token expired or invalid, clearing auth state');
        await logout();
        // Notify popup to show login view
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: null,
          reason: 'token_expired'
        }).catch(() => {});
        return null;
      }
      console.error('Failed to fetch user stats:', response.status);
      return null;
    }

    const stats = await response.json();
    return stats;
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
}

/**
 * Save authentication token and user info
 */
async function saveAuthToken(token, user) {
  return new Promise((resolve, reject) => {
    // Calculate token expiration (Firebase tokens last 1 hour)
    // We'll refresh at 50 minutes to be safe
    const expiresAt = Date.now() + (50 * 60 * 1000); // 50 minutes from now
    
    chrome.storage.local.set({ 
      authToken: token,
      authUser: user,
      tokenExpiresAt: expiresAt,
      guestMode: false
    }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log('✅ Auth token saved (expires in 50 minutes)');
        // Notify popup of auth state change
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: user 
        }).catch(() => {}); // Ignore if popup is closed
        resolve();
      }
    });
  });
}

/**
 * Logout user - clear stored auth data
 */
async function logout() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(['authToken', 'authUser', 'tokenExpiresAt'], () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log('✅ User logged out');
        // Notify popup of auth state change
        chrome.runtime.sendMessage({ 
          action: 'authStateChanged', 
          user: null 
        }).catch(() => {}); // Ignore if popup is closed
        resolve();
      }
    });
  });
}

/**
 * Listen for auth messages from web app (when user logs in on website)
 */
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('📨 External message received from:', sender.url);
  console.log('📨 Message action:', request.action);
  console.log('📨 Message details:', { 
    hasToken: !!request.token, 
    hasUser: !!request.user,
    userEmail: request.user?.email 
  });
  
  if (request.action === 'authUpdate' && request.token && request.user) {
    console.log('✅ Valid authUpdate message received, saving token...');
    saveAuthToken(request.token, request.user)
      .then(() => {
        console.log('✅ Token saved successfully');
        sendResponse({ success: true, message: 'Auth token saved' });
      })
      .catch(error => {
        console.error('❌ Error saving token:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  } else {
    console.log('⚠️ Invalid message format or missing data');
    sendResponse({ success: false, error: 'Invalid message format' });
  }
});


/**
 * Detect language of the text
 */
async function detectLanguage(text, apiBase, apiKey, authToken) {
  try {
    const apiUrl = `${apiBase}/api/detect-language`;
    console.log('🌍 Detecting language...');

    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Use auth token if available, otherwise fall back to extension token
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error('❌ Language detection failed:', response.status);
      return 'auto'; // Fallback to auto
    }

    const data = await response.json();
    const detectedCode = data.code || 'auto';
    console.log('🌍 Detected language:', detectedCode);
    return detectedCode;
  } catch (error) {
    console.error('❌ Language detection error:', error);
    return 'auto'; // Fallback to auto
  }
}

/**
 * Convert new API response format to old format for extension compatibility
 */
function convertResponseToErrors(data, originalText) {
  const { corrected_text, changes } = data;

  if (!Array.isArray(changes) || changes.length === 0) {
    return [];
  }

  const errors = [];

  changes.forEach((change) => {
    const original = change.original || '';
    const corrected = change.corrected || '';
    const explanation = change.explanation || 'Grammar or spelling error';

    // Find all occurrences of the original text
    let searchIndex = 0;
    while (searchIndex < originalText.length) {
      const foundIndex = originalText.indexOf(original, searchIndex);

      if (foundIndex === -1) {
        break; // No more occurrences
      }

      // Check if we already have an error at this position
      const hasExistingError = errors.some(
        (e) => e.start === foundIndex && e.end === foundIndex + original.length
      );

      if (!hasExistingError) {
        errors.push({
          start: foundIndex,
          end: foundIndex + original.length,
          type: 'grammar',
          message: explanation,
          suggestion: corrected,
          original: original,
        });
      }

      searchIndex = foundIndex + 1;
    }
  });

  console.log('✅ Converted', changes.length, 'changes to', errors.length, 'errors');
  return errors;
}

/**
 * Handle grammar check request
 * Calls the backend API and returns results
 */
async function handleGrammarCheck(request, sender) {
  try {
    const { text, apiBase, language, apiKey, authToken, userId } = request;

    console.log('📝 Text length:', text.length);
    console.log('🌐 API Base:', apiBase);
    console.log('🔑 Extension Token:', apiKey ? 'Provided' : 'Not provided');
    console.log('🔐 Auth Token:', authToken ? 'Logged in' : 'Guest');
    console.log('👤 User ID:', userId || 'None');

    if (!text || text.trim() === '') {
      console.log('❌ Empty text');
      return { error: 'Empty text provided' };
    }

    // Detect language if not provided
    let targetLanguage = language || 'auto';
    if (targetLanguage === 'auto') {
      targetLanguage = await detectLanguage(text, apiBase, apiKey, authToken);
    }
    console.log('🌍 Target language:', targetLanguage);

    // Construct API URL for proofreading
    const apiUrl = `${apiBase}/api/proofread`;

    console.log('🔗 Making request to:', apiUrl);

    // Make fetch request to backend API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Priority 1: Use Firebase auth token if user is logged in (for usage tracking)
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('🔐 Using Firebase auth token (logged in user)');
    }
    // Priority 2: Use extension API key for guest users (bypasses rate limits)
    else if (apiKey && apiKey !== 'YOUR_API_KEY_HERE') {
      headers['X-API-Key'] = apiKey;
      console.log('🔑 Using extension token (guest user)');
    }

    // Prepare request body
    const requestBody = {
      text: text,
      language: targetLanguage,
    };

    // Add userId if available (for usage tracking)
    if (userId) {
      requestBody.userId = userId;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('📨 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error:', response.status, errorText);
      
      // Handle specific HTTP status codes
      if (response.status === 429) {
        return {
          error: 'Too many requests. This might be a server issue. Please contact support.',
          details: errorText,
        };
      }
      
      if (response.status === 503) {
        return {
          error: 'Service temporarily unavailable. Please try again in a moment.',
          details: errorText,
        };
      }
      
      return {
        error: `API error: ${response.status} ${response.statusText}`,
        details: errorText,
      };
    }

    // Parse API response
    const data = await response.json();
    console.log('📤 Response received:', data);

    // Validate response format (new format: corrected_text and changes)
    if (!data.corrected_text || !Array.isArray(data.changes)) {
      console.error('❌ Invalid response format');
      return {
        error: 'Invalid API response format',
        details: data,
      };
    }

    // Convert new API format to old error format
    const errors = convertResponseToErrors(data, text);

    // Return parsed errors
    console.log('✅ Returning errors:', errors.length);
    return {
      errors: errors,
      correctedText: data.corrected_text,
      changes: data.changes,
    };
  } catch (error) {
    console.error('❌ Grammar check error:', error);

    // Check if it's an AbortError (timeout)
    if (error.name === 'AbortError') {
      return {
        error: 'Request timed out. The API might be slow or rate-limited.',
        details: 'Please try again in a few moments.',
      };
    }

    return {
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
    };
  }
}

/**
 * Extension lifecycle hooks
 */

// On extension install or update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('CorrectNow extension installed');
    // Optionally open welcome page
    // chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    console.log('CorrectNow extension updated');
  }
});

// Optional: Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Show notification or perform action when extension icon is clicked
  console.log('Extension icon clicked on tab:', tab.id);
});
