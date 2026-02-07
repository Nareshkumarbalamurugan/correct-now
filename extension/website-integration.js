/**
 * CorrectNow Extension Authentication Helper
 * Add this script to the auth success page to pass tokens to the extension
 * 
 * Usage: Include this script in your auth page and call:
 * notifyExtension(firebaseUser)
 */

/**
 * Send authentication data to Chrome extension
 * Call this after successful login/signup
 */
export async function notifyExtension(user) {
  if (!user) {
    console.log('❌ No user provided to notifyExtension');
    return;
  }

  try {
    // Get fresh ID token
    const token = await user.getIdToken();
    
    // Send message to extension
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Find the extension by ID (you'll need to update this with your extension ID)
      const extensionId = 'YOUR_EXTENSION_ID_HERE'; // TODO: Replace with actual extension ID
      
      chrome.runtime.sendMessage(
        extensionId,
        {
          action: 'authSuccess',
          token: token,
          email: user.email,
          userId: user.uid
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Extension not installed or not responding');
          } else {
            console.log('✅ Auth token sent to extension');
          }
        }
      );
    }
    
    // Also store in localStorage as fallback
    localStorage.setItem('correctnow-ext-auth', JSON.stringify({
      token,
      email: user.email,
      userId: user.uid,
      timestamp: Date.now()
    }));
    
    console.log('✅ Auth data stored for extension');
  } catch (error) {
    console.error('❌ Failed to notify extension:', error);
  }
}

/**
 * Check if extension is installed
 */
export function checkExtensionInstalled() {
  return typeof chrome !== 'undefined' && 
         chrome.runtime !== undefined &&
         chrome.runtime.sendMessage !== undefined;
}
