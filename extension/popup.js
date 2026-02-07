/**
 * CorrectNow Extension Popup
 * Handles user authentication and displays usage stats
 */

const WEBAPP_AUTH_URL = 'https://correctnow.app/auth';
const WEBAPP_DASHBOARD_URL = 'https://correctnow.app/dashboard';
const WEBAPP_PRICING_URL = 'https://correctnow.app/pricing';

// DOM Elements
const loadingView = document.getElementById('loadingView');
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginBtn = document.getElementById('loginBtn');
const continueWithoutLoginBtn = document.getElementById('continueWithoutLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const upgradeBtn = document.getElementById('upgradeBtn');
const dashboardBtn = document.getElementById('dashboardBtn');
const disableExtensionBtn = document.getElementById('disableExtensionBtn');
const disableExtensionBtnLogin = document.getElementById('disableExtensionBtnLogin');
const userEmail = document.getElementById('userEmail');
const planBadge = document.getElementById('planBadge');
const checksUsed = document.getElementById('checksUsed');
const creditsRemaining = document.getElementById('creditsRemaining');
const progressFill = document.getElementById('progressFill');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

/**
 * Initialize popup on load
 */
async function init() {
  console.log('Popup initializing...');
  
  try {
    // Check extension enabled state
    const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
    const isEnabled = extensionEnabled !== false; // default to true
    
    // Update button texts based on state
    if (disableExtensionBtn) {
      disableExtensionBtn.textContent = isEnabled ? 'Disable Extension' : 'Enable Extension';
    }
    if (disableExtensionBtnLogin) {
      disableExtensionBtnLogin.textContent = isEnabled ? 'Disable Extension' : 'Enable Extension';
    }
    
    // Check if user is logged in
    const authState = await getAuthState();
    
    if (authState && authState.user) {
      console.log('User is logged in:', authState.user.email);
      await showDashboard(authState);
    } else {
      console.log('User is not logged in');
      showLogin();
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    showLogin();
  }
}

/**
 * Get authentication state from background script
 */
async function getAuthState() {
  return new Promise((resolve) => {
    let resolved = false;
    
    try {
      chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
        if (!resolved) {
          resolved = true;
          if (chrome.runtime.lastError) {
            console.error('Error getting auth state:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('Auth state request timed out');
          resolve(null);
        }
      }, 5000);
    } catch (error) {
      if (!resolved) {
        resolved = true;
        console.error('Exception getting auth state:', error);
        resolve(null);
      }
    }
  });
}

/**
 * Get user usage stats
 */
async function getUserStats() {
  return new Promise((resolve) => {
    let resolved = false;
    
    try {
      chrome.runtime.sendMessage({ action: 'getUserStats' }, (response) => {
        if (!resolved) {
          resolved = true;
          if (chrome.runtime.lastError) {
            console.error('Error getting user stats:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('User stats request timed out');
          resolve(null);
        }
      }, 5000);
    } catch (error) {
      if (!resolved) {
        resolved = true;
        console.error('Exception getting user stats:', error);
        resolve(null);
      }
    }
  });
}

/**
 * Show login view
 */
function showLogin() {
  loadingView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

/**
 * Show dashboard view
 */
async function showDashboard(authState) {
  loadingView.classList.add('hidden');
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  
  // Display user info
  userEmail.textContent = authState.user.email || 'User';
  
  // Get usage stats
  const stats = await getUserStats();
  
  if (stats) {
    // Update plan badge
    const planType = stats.planType || 'free';
    planBadge.textContent = planType.charAt(0).toUpperCase() + planType.slice(1) + ' Plan';
    planBadge.style.background = planType === 'free' ? '#71717a' : '#0077B5';
    
    // Update usage stats
    const creditsUsed = stats.dailyChecksUsed || 0;
    const totalCredits = stats.dailyLimit || 5;
    const creditsLeft = stats.creditsRemaining;
    
    // Format numbers with commas
    const formatNumber = (num) => {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };
    
    // Show usage as "used / total"
    checksUsed.textContent = `${formatNumber(creditsUsed)} / ${formatNumber(totalCredits)}`;
    
    if (creditsLeft !== null && creditsLeft !== undefined && creditsLeft >= 0) {
      creditsRemaining.textContent = formatNumber(creditsLeft);
    } else {
      creditsRemaining.textContent = '∞';
    }
    
    // Update progress bar
    const progress = Math.min((creditsUsed / totalCredits) * 100, 100);
    progressFill.style.width = progress + '%';
    
    // Show/hide upgrade button (only for free users)
    if (planType === 'free') {
      upgradeBtn.classList.remove('hidden');
    } else {
      upgradeBtn.classList.add('hidden');
    }
  } else {
    // Default values if stats not available
    checksUsed.textContent = '0 / 5';
    creditsRemaining.textContent = '5';
    progressFill.style.width = '0%';
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

/**
 * Show success message
 */
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.classList.remove('hidden');
  setTimeout(() => {
    successMessage.classList.add('hidden');
  }, 3000);
}

/**
 * Handle login button click
 */
loginBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // Open auth page in new tab
  chrome.tabs.create({ url: WEBAPP_AUTH_URL });
});

/**
 * Handle continue without login button click
 */
continueWithoutLoginBtn.addEventListener('click', () => {
  // Store guest mode preference
  chrome.storage.local.set({ guestMode: true }, () => {
    window.close();
  });
});

/**
 * Handle logout button click
 */
logoutBtn.addEventListener('click', async () => {
  try {
    // Send logout message to background script
    chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Logout failed. Please try again.');
        return;
      }
      
      if (response && response.success) {
        showSuccess('Logged out successfully!');
        setTimeout(() => {
          showLogin();
        }, 1000);
      } else {
        showError('Logout failed. Please try again.');
      }
    });
  } catch (error) {
    console.error('Logout error:', error);
    showError('An error occurred during logout.');
  }
});

/**
 * Handle upgrade button click
 */
upgradeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: WEBAPP_PRICING_URL });
});

/**
 * Handle dashboard button click
 */
dashboardBtn.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: WEBAPP_DASHBOARD_URL });
});

/**
 * Handle disable extension button click (dashboard view)
 */
if (disableExtensionBtn) {
  disableExtensionBtn.addEventListener('click', async () => {
    try {
      const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
      const isEnabled = extensionEnabled !== false;
      
      // Toggle the state
      await chrome.storage.local.set({ extensionEnabled: !isEnabled });
      
      if (isEnabled) {
        disableExtensionBtn.textContent = 'Enable Extension';
        showSuccess('Extension disabled. Grammar checking is now inactive.');
      } else {
        disableExtensionBtn.textContent = 'Disable Extension';
        showSuccess('Extension enabled. Grammar checking is now active.');
      }
      
      // Reload all tabs to apply changes
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    } catch (error) {
      console.error('Error toggling extension:', error);
      showError('Failed to toggle extension state.');
    }
  });
}

/**
 * Handle disable extension button click (login view)
 */
if (disableExtensionBtnLogin) {
  disableExtensionBtnLogin.addEventListener('click', async () => {
    try {
      const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
      const isEnabled = extensionEnabled !== false;
      
      // Toggle the state
      await chrome.storage.local.set({ extensionEnabled: !isEnabled });
      
      if (isEnabled) {
        disableExtensionBtnLogin.textContent = 'Enable Extension';
        showSuccess('Extension disabled. Grammar checking is now inactive.');
      } else {
        disableExtensionBtnLogin.textContent = 'Disable Extension';
        showSuccess('Extension enabled. Grammar checking is now active.');
      }
      
      // Reload all tabs to apply changes
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
    } catch (error) {
      console.error('Error toggling extension:', error);
      showError('Failed to toggle extension state.');
    }
  });
}

/**
 * Listen for auth state changes from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authStateChanged') {
    console.log('Auth state changed:', message.user ? 'logged in' : 'logged out');
    
    if (message.reason === 'token_expired') {
      showError('Your session has expired. Please log in again.');
    }
    
    if (message.user) {
      showDashboard({ user: message.user });
    } else {
      showLogin();
    }
  } else if (message.action === 'usageUpdated') {
    console.log('Usage updated');
    // Refresh stats
    getAuthState().then((authState) => {
      if (authState && authState.user) {
        showDashboard(authState);
      }
    });
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
