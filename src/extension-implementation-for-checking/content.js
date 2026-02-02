/**
 * CorrectNow Content Script
 * Injects grammar checking functionality into webpages
 * - Detects input/textarea focus
 * - Shows floating "Check with CorrectNow" button
 * - Communicates with background.js for API calls
 * - Highlights grammar errors with yellow background
 */

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:8787', // Change to your API URL
  BUTTON_TEXT: 'Check with CorrectNow',
  BUTTON_CLASS: 'correctnow-check-button',
  HIGHLIGHT_CLASS: 'correctnow-error-highlight',
  MESSAGE_CLASS: 'correctnow-message',
};

let currentFocusedElement = null;
let floatingButton = null;
let applyAllButton = null; // Apply All button
let highlightedRanges = [];
let originalContent = null; // Store original content for restoration
let isCheckingInProgress = false; // Prevent concurrent checks
let hoverTooltip = null; // Hover correction tooltip
let currentErrors = []; // Store errors for correction

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create and position the floating button
 */
function createFloatingButton() {
  const button = document.createElement('button');
  button.className = CONFIG.BUTTON_CLASS;
  button.textContent = CONFIG.BUTTON_TEXT;
  button.type = 'button';
  button.title = 'Click to check grammar with CorrectNow';

  // Style the button
  button.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    padding: 8px 12px;
    background-color: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: auto;
    user-select: none;
  `;
  
  console.log('🔷 Button created');

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#1d4ed8';
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#2563eb';
    button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  });

  // Click handler with immediate logging
  button.addEventListener('click', (e) => {
    console.log('🟢 BUTTON CLICKED - Event captured!', e);
    e.preventDefault();
    e.stopPropagation();
    handleCheckClick();
  }, true);

  return button;
}

/**
 * Position the button near the focused element
 */
function positionButton(element, button) {
  const rect = element.getBoundingClientRect();
  const offset = 5;

  // Position: top-right corner of the input
  const top = rect.top + window.scrollY - 5;
  const left = rect.right + window.scrollX + offset;

  button.style.top = top + 'px';
  button.style.left = left + 'px';
}

/**
 * Show floating button on input/textarea focus
 */
function handleFocus(event) {
  const element = event.target;

  // Only attach to textarea and text inputs
  if (!isEditableField(element)) return;

  // Clear previous highlights
  clearHighlights();

  // For Gmail and similar editors, find the main compose container
  let targetElement = element;
  if (element.isContentEditable) {
    // Walk up the tree to find the root contentEditable container
    let parent = element.parentElement;
    while (parent && parent.isContentEditable) {
      targetElement = parent;
      parent = parent.parentElement;
    }
    console.log('🎯 Found compose container:', targetElement.className || targetElement.tagName);
  }

  // Store focused element
  currentFocusedElement = targetElement;

  // Create button if it doesn't exist
  if (!floatingButton || !document.body.contains(floatingButton)) {
    console.log('🔷 Creating new button');
    floatingButton = createFloatingButton();
    document.body.appendChild(floatingButton);
  } else {
    console.log('🔷 Reusing existing button');
  }

  // Position and show button
  positionButton(targetElement, floatingButton);
  floatingButton.style.display = 'block';
  floatingButton.style.opacity = '1';
  console.log('🔷 Button shown at position:', floatingButton.style.left, floatingButton.style.top);
}

/**
 * Hide floating button on blur
 */
function handleBlur(event) {
  // Don't hide if user is clicking the button
  if (event && event.relatedTarget === floatingButton) {
    console.log('🔷 Button blur - button clicked, keeping state');
    return;
  }
  
  if (floatingButton) {
    // Keep button visible but make it slightly transparent
    floatingButton.style.opacity = '0.7';
    console.log('🔷 Button blur - keeping visible');
  }
  // Don't clear currentFocusedElement - keep it for button clicks
}

/**
 * Check if element is an editable field
 */
function isEditableField(element) {
  if (element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'INPUT' && element.type === 'text') return true;
  if (element.isContentEditable) return true;
  return false;
}


/**
 * Extract plain text from a contentEditable element using a DOM walk, preserving mapping.
 */
function extractPlainTextAndMap(element) {
  let text = '';
  const map = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    for (let i = 0; i < node.textContent.length; i++) {
      map[text.length] = { node, offset: i };
      text += node.textContent[i];
    }
  }
  return { text, map };
}

/**
 * Handle "Check with CorrectNow" button click
 */
function handleCheckClick() {
  console.log('🔵 Button clicked');
  // Prevent concurrent checks
  if (isCheckingInProgress) {
    console.log('⏳ Check already in progress, skipping');
    return;
  }
  if (!currentFocusedElement) {
    console.log('❌ No focused element');
    return;
  }
  let text, offsetMap;
  if (currentFocusedElement.value !== undefined) {
    text = currentFocusedElement.value;
    offsetMap = null;
  } else if (currentFocusedElement.isContentEditable) {
    const result = extractPlainTextAndMap(currentFocusedElement);
    text = result.text;
    offsetMap = result.map;
  } else if (currentFocusedElement.textContent !== undefined) {
    text = currentFocusedElement.textContent;
    offsetMap = null;
  } else {
    text = '';
    offsetMap = null;
  }
  console.log('📝 Text extracted:', text ? text.substring(0, 50) + '...' : '(empty)');
  console.log('📝 Text length:', text ? text.length : 0);
  if (!text || text.trim() === '') {
    showMessage('Please enter some text to check', 'warning');
    console.log('⚠️ Text is empty');
    return;
  }
  clearHighlights();
  isCheckingInProgress = true;
  floatingButton.disabled = true;
  floatingButton.textContent = 'Checking...';
  console.log('⏳ Sending message to service worker...');
  console.log('📤 API Base URL:', CONFIG.API_BASE_URL);
  let checkTimeout;
  const resetButton = () => {
    isCheckingInProgress = false;
    if (floatingButton) {
      floatingButton.disabled = false;
      floatingButton.textContent = CONFIG.BUTTON_TEXT;
    }
  };
  checkTimeout = setTimeout(() => {
    console.error('❌ Check timeout - no response after 60 seconds');
    showMessage('Request timed out. API might be slow or rate-limited. Wait a few minutes and try again.', 'error');
    resetButton();
  }, 60000);
  // Send message to background.js
  chrome.runtime.sendMessage(
    {
      action: 'checkGrammar',
      text: text,
      apiBase: CONFIG.API_BASE_URL,
    },
    (response) => {
      clearTimeout(checkTimeout);
      console.log('📥 Response received:', response);
      resetButton();
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        console.error('❌ Runtime error:', error);
        showMessage('Error: ' + error.message, 'error');
        return;
      }
      if (!response) {
        console.log('❌ No response');
        showMessage('No response from API', 'error');
        return;
      }
      if (response.error) {
        console.error('❌ API error:', response.error);
        showMessage(`Error: ${response.error}`, 'error');
        return;
      }
      if (response.errors && response.errors.length > 0) {
        console.log('📨 Raw API response errors:', response.errors);
        // Use API-provided positions directly, with the same text and mapping as sent
        const fullText = text;
        const fixedErrors = [];
        const usedPositions = new Set();
        const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
        response.errors.forEach((err) => {
          if (!err || typeof err.start !== 'number' || typeof err.end !== 'number') return;
          if (!err.suggestion || !String(err.suggestion).trim()) return;
          const start = clamp(Math.floor(err.start), 0, fullText.length);
          const end = clamp(Math.floor(err.end), 0, fullText.length);
          if (end <= start) return;
          const snippet = fullText.substring(start, end);
          if (!snippet || snippet.trim().length === 0) return;
          const posKey = `${start}-${end}`;
          if (usedPositions.has(posKey)) return;
          usedPositions.add(posKey);
          fixedErrors.push({
            start,
            end,
            type: err.type || 'spelling',
            message: err.message || 'Grammar issue',
            suggestion: String(err.suggestion),
          });
        });
        console.log('✅ Errors using API positions:', fixedErrors);
        if (fixedErrors.length > 0) {
          highlightErrors(currentFocusedElement, fixedErrors, offsetMap);
          showMessage(`Found ${fixedErrors.length} issue(s)`, 'info');
          if (fixedErrors.length >= 2) {
            showApplyAllButton();
          }
        } else {
          clearHighlights();
          showMessage('No issues found', 'success');
        }
      } else {
        console.log('✅ No errors found');
        clearHighlights();
        showMessage('No issues found', 'success');
      }
    }
  );
}

/**
 * Highlight grammar errors in the input/textarea
 * For contentEditable: underline errors in red
 * For input/textarea: show yellow border + message
 */

function highlightErrors(element, errors, offsetMap) {
  // Clear previous highlights
  clearHighlights();
  // Store errors for correction
  currentErrors = errors;
  const isTextInput = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
  console.log('📍 Highlighting', errors.length, 'errors');
  console.log('Errors to highlight:', errors.map(e => `${e.start}-${e.end}`).join(', '));

  if (!isTextInput && element.isContentEditable) {
    // Store original HTML for restoration
    originalContent = element.innerHTML;
    // Use the provided offsetMap (from extractPlainTextAndMap) for perfect sync
    const map = offsetMap || (() => {
      const m = [];
      let charIndex = 0;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        for (let i = 0; i < node.textContent.length; i++) {
          m[charIndex] = { node, offset: i };
          charIndex++;
        }
      }
      return m;
    })();
    // Helper to wrap a range in a span
    const wrapRange = (start, end, error) => {
      if (start >= end || !map[start] || !map[end - 1]) return;
      const startInfo = map[start];
      const endInfo = map[end - 1];
      const range = document.createRange();
      range.setStart(startInfo.node, startInfo.offset);
      range.setEnd(endInfo.node, endInfo.offset + 1);
      const span = document.createElement('span');
      span.textContent = range.toString();
      span.style.cssText = `
        text-decoration: underline solid #ef4444;
        text-decoration-thickness: 2px;
        text-underline-offset: 2px;
        cursor: pointer;
        background-color: rgba(239, 68, 68, 0.1);
      `;
      span.title = error.message || 'Grammar issue';
      span.dataset.suggestion = error.suggestion || '';
      span.addEventListener('mouseenter', (e) => showCorrectionTooltip(e, error));
      span.addEventListener('mouseleave', () => {
        setTimeout(hideCorrectionTooltip, 3000);
      });
      range.deleteContents();
      range.insertNode(span);
    };
    // Sort errors by start ascending, then end descending (to handle overlaps cleanly)
    const sorted = [...errors].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end;
    });
    // Track which character offsets have already been wrapped
    const wrapped = new Set();
    sorted.forEach(err => {
      let overlap = false;
      for (let i = err.start; i < err.end; i++) {
        if (wrapped.has(i)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        wrapRange(err.start, err.end, err);
        for (let i = err.start; i < err.end; i++) wrapped.add(i);
      }
    });
    highlightedRanges.push(element);
  } else if (isTextInput) {
    // For regular inputs/textareas, show yellow border (can't directly highlight text)
    element.style.borderColor = '#fbbf24';
    element.style.borderWidth = '2px';
    element.style.outline = '2px solid rgba(251, 191, 36, 0.8)';
    element.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.1)';
    highlightedRanges.push(element);
  }

  // Build detailed message with line breaks preserved
  const errorMessages = errors
    .map((err, idx) => {
      const start = err.start || 0;
      const end = err.end || start + 1;
      const elementText = isTextInput ? element.value : (element.textContent || '');
      const context = elementText.substring(
        Math.max(0, start - 10),
        Math.min(elementText.length, end + 10)
      );
      return `${idx + 1}. ${err.message || 'Grammar error'}\n   Context: "...${context}..."`;
    })
    .join('\n');

  showMessage(
    errors.length ? `Issues found:\n${errorMessages}` : 'No issues found',
    errors.length ? 'info' : 'success',
    true
  );
}

/**
 * Clear all highlights
 */
function clearHighlights() {
  highlightedRanges.forEach((element) => {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // Clear input styles
      element.style.borderColor = '';
      element.style.borderWidth = '';
      element.style.outline = '';
      element.style.boxShadow = '';
    } else if (element.isContentEditable && originalContent) {
      // Restore original content (without spans)
      element.innerHTML = originalContent;
      originalContent = null;
    }
  });
  highlightedRanges = [];
  currentErrors = [];
  hideCorrectionTooltip();
  hideApplyAllButton();
}

/**
 * Create and show Apply All button
 */
function showApplyAllButton() {
  if (!applyAllButton) {
    applyAllButton = document.createElement('button');
    applyAllButton.textContent = '✓ Apply All Corrections';
    applyAllButton.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      padding: 10px 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      visibility: hidden;
    `;

    applyAllButton.addEventListener('mouseenter', () => {
      applyAllButton.style.transform = 'translateY(-2px)';
      applyAllButton.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
    });
    
    applyAllButton.addEventListener('mouseleave', () => {
      applyAllButton.style.transform = 'translateY(0)';
      applyAllButton.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
    });
    
    applyAllButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyAllCorrections();
    });
    
    document.body.appendChild(applyAllButton);
    console.log('✅ Apply All button created and shown');
  }

  applyAllButton.style.display = 'block';

  // Measure after in DOM so we can clamp without cutting off text
  const buttonRect = applyAllButton.getBoundingClientRect();
  const minPad = 10;
  const margin = 12;
  const btnWidth = buttonRect.width || 0;
  const btnHeight = buttonRect.height || 0;

  if (floatingButton) {
    const rect = floatingButton.getBoundingClientRect();
    let top = rect.top - btnHeight - margin;
    let left = rect.left;

    if (top < minPad) {
      top = rect.bottom + margin; // if above viewport, place below button
    }

    // Clamp horizontally so the button stays fully visible
    if (left + btnWidth + minPad > window.innerWidth) {
      left = Math.max(minPad, window.innerWidth - btnWidth - minPad);
    }
    if (left < minPad) {
      left = minPad;
    }

    applyAllButton.style.top = `${Math.round(top)}px`;
    applyAllButton.style.left = `${Math.round(left)}px`;
    applyAllButton.style.right = 'auto';
    applyAllButton.style.bottom = 'auto';
    applyAllButton.style.minWidth = `${Math.max(rect.width, btnWidth)}px`;
  } else {
    // Fallback position if button not available
    applyAllButton.style.top = 'auto';
    applyAllButton.style.right = 'auto';
    applyAllButton.style.left = `${minPad}px`;
    applyAllButton.style.bottom = '80px';
    applyAllButton.style.minWidth = '180px';
  }

  applyAllButton.style.visibility = 'visible';
}

/**
 * Hide Apply All button
 */
function hideApplyAllButton() {
  if (applyAllButton) {
    applyAllButton.remove();
    applyAllButton = null;
  }
}

/**
 * Apply all corrections at once
 */

function applyAllCorrections() {
  console.log('✅ Applying all corrections. Current errors:', currentErrors.length);
  if (!currentFocusedElement) {
    console.log('❌ No focused element');
    return;
  }
  // Get all error spans in document order (left to right)
  const errorSpans = Array.from(currentFocusedElement.querySelectorAll('span[style*="underline"]'));
  if (errorSpans.length === 0) {
    showMessage('No corrections to apply', 'error');
    return;
  }
  // Sort spans by their position in the document (start offset)
  const getOffset = (el) => {
    let offset = 0, node = currentFocusedElement.firstChild;
    while (node && node !== el) {
      offset += node.textContent ? node.textContent.length : 0;
      node = node.nextSibling;
    }
    return offset;
  };
  errorSpans.sort((a, b) => {
    // Use compareDocumentPosition for robustness
    if (a === b) return 0;
    if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return -1;
  });
  // Replace from end to start to avoid offset shifting
  let appliedCount = 0;
  for (let i = errorSpans.length - 1; i >= 0; i--) {
    const span = errorSpans[i];
    const suggestion = span.dataset.suggestion;
    if (suggestion && suggestion.trim() && span.parentNode) {
      const textNode = document.createTextNode(suggestion);
      span.parentNode.replaceChild(textNode, span);
      appliedCount++;
    }
  }
  if (currentFocusedElement) {
    currentFocusedElement.normalize();
    originalContent = currentFocusedElement.innerHTML;
  }
  currentErrors = [];
  highlightedRanges = [];
  hideCorrectionTooltip();
  hideApplyAllButton();
  if (appliedCount > 0) {
    showMessage(`Applied ${appliedCount} correction(s)!`, 'success');
  } else {
    showMessage('No corrections applied', 'error');
  }
}

/**
 * Show correction tooltip on hover
 */
function showCorrectionTooltip(event, error) {
  hideCorrectionTooltip();
  
  const span = event.target;
  const rect = span.getBoundingClientRect();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'correctnow-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    z-index: 2147483646;
    background: white;
    border: 2px solid #ef4444;
    border-radius: 6px;
    padding: 8px 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    min-width: 120px;
  `;
  
  const hasSuggestion = error.suggestion && error.suggestion.trim() && error.suggestion !== 'No suggestion';
  
  console.log('🎯 Showing tooltip for:', error.message, 'Suggestion:', error.suggestion, 'Has valid suggestion:', hasSuggestion);
  
  tooltip.innerHTML = `
    <div style="color: #666; font-size: 11px; margin-bottom: 4px;">${escapeHtml(error.message || 'Spelling error')}</div>
    <div style="font-weight: 600; color: ${hasSuggestion ? '#10b981' : '#999'}; margin-bottom: 6px;">${escapeHtml(error.suggestion || 'No suggestion available')}</div>
    ${hasSuggestion ? `<button style="
      background: #10b981;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
      width: 100%;
    ">Apply correction</button>` : ''}
  `;
  
  document.body.appendChild(tooltip);
  
  // Position tooltip
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  let top = rect.bottom + 5;
  
  // Keep within viewport
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width - 10;
  }
  if (left < 10) left = 10;
  if (top + tooltipRect.height > window.innerHeight - 10) {
    top = rect.top - tooltipRect.height - 5;
  }
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  
  // Keep tooltip visible when hovering over it
  let tooltipHoverTimeout;
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHoverTimeout);
  });
  tooltip.addEventListener('mouseleave', () => {
    tooltipHoverTimeout = setTimeout(hideCorrectionTooltip, 5000);
  });
  
  // Hide tooltip when leaving the error span (with much longer delay)
  span.addEventListener('mouseleave', () => {
    tooltipHoverTimeout = setTimeout(hideCorrectionTooltip, 3000);
  });
  
  // Apply button click handler (only if suggestion exists)
  if (hasSuggestion) {
    const applyBtn = tooltip.querySelector('button');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        clearTimeout(tooltipHoverTimeout);
        applyCorrection(span, error);
        hideCorrectionTooltip();
      });
    }
  }
  
  hoverTooltip = tooltip;
}

/**
 * Hide correction tooltip
 */
function hideCorrectionTooltip() {
  if (hoverTooltip) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }
}

/**
 * Apply correction to the text
 */
function applyCorrection(span, error) {
  if (!error.suggestion || !currentFocusedElement) {
    console.log('❌ Cannot apply correction - missing suggestion or element');
    return;
  }
  
  console.log('✏️ Applying correction from:', span.textContent, 'to:', error.suggestion);
  
  try {
    // Replace the span with corrected text
    const textNode = document.createTextNode(error.suggestion);
    if (span.parentNode) {
      span.parentNode.replaceChild(textNode, span);
      console.log('✅ Replaced span with text node');
      
      // Force normalize to merge adjacent text nodes
      if (span.parentNode) {
        span.parentNode.normalize();
      }
    } else {
      console.log('❌ Span has no parent node');
    }
    
    // Remove from errors list
    currentErrors = currentErrors.filter(e => e !== error);
    console.log('📋 Remaining errors:', currentErrors.length);
    
    // Update originalContent to preserve the current state
    if (currentFocusedElement) {
      originalContent = currentFocusedElement.innerHTML;
    }
    
    // If no errors remain, clean up and show success
    if (currentErrors.length === 0) {
      console.log('🎉 All errors corrected!');
      setTimeout(() => {
        // Remove any remaining error span styling
        if (currentFocusedElement) {
          const errorSpans = currentFocusedElement.querySelectorAll('span[style*="underline wavy"]');
          console.log('Cleaning up', errorSpans.length, 'remaining spans');
          errorSpans.forEach(s => {
            const text = document.createTextNode(s.textContent);
            if (s.parentNode) {
              s.parentNode.replaceChild(text, s);
            }
          });
          originalContent = currentFocusedElement.innerHTML;
        }
        highlightedRanges = [];
        hideCorrectionTooltip();
        showMessage('All corrections applied!', 'success');
      }, 100);
    }
  } catch (err) {
    console.error('❌ Error applying correction:', err);
  }
}

/**
 * Show temporary message near button
 */
function showMessage(text, type = 'info', isDetailed = false) {
  // Remove existing message
  const existing = document.querySelector(`.${CONFIG.MESSAGE_CLASS}`);
  if (existing) {
    existing.remove();
  }

  const message = document.createElement('div');
  message.className = CONFIG.MESSAGE_CLASS;

  // Color based on type
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const bgColors = {
    success: '#ecfdf5',
    error: '#fef2f2',
    warning: '#fffbeb',
    info: '#eff6ff',
  };

  // Temporary positioning to measure size
  message.style.cssText = `
    position: fixed;
    z-index: 999998;
    padding: 12px 16px;
    background-color: ${bgColors[type]};
    color: ${colors[type]};
    border: 1px solid ${colors[type]};
    border-radius: 4px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 350px;
    white-space: ${isDetailed ? 'pre-wrap' : 'nowrap'};
    word-wrap: break-word;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    visibility: hidden;
  `;

  message.textContent = text;
  document.body.appendChild(message);

  // Calculate position to keep within viewport
  const rect = message.getBoundingClientRect();
  const padding = 10;
  let left = floatingButton ? floatingButton.offsetLeft : 20;
  let top = floatingButton ? floatingButton.offsetTop + 40 : 20;

  // Get focused element bounds to avoid overlap
  const focusedRect = currentFocusedElement ? currentFocusedElement.getBoundingClientRect() : null;

  // Adjust if goes off right edge - move to left side
  if (left + rect.width + padding > window.innerWidth) {
    left = Math.max(padding, window.innerWidth - rect.width - padding);
  }

  // Adjust if goes off bottom edge - show above instead
  if (top + rect.height + padding > window.innerHeight) {
    top = Math.max(padding, window.innerHeight - rect.height - padding);
  }

  // If message overlaps focused element, position above it
  if (focusedRect && top < focusedRect.bottom && top + rect.height > focusedRect.top) {
    top = Math.max(padding, focusedRect.top - rect.height - 10);
    // If still no space above, move to left side
    if (top < padding) {
      left = Math.max(padding, Math.min(left - rect.width - 20, window.innerWidth - rect.width - padding));
    }
  }

  // Apply final positioning
  message.style.visibility = 'visible';
  message.style.left = left + 'px';
  message.style.top = top + 'px';

  // Auto-remove after 4 seconds
  setTimeout(() => {
    message.style.opacity = '0';
    message.style.transition = 'opacity 0.3s ease';
    setTimeout(() => message.remove(), 300);
  }, 4000);
}

/**
 * Initialize content script
 * Attach event listeners to all input/textarea elements
 */
function initializeContentScript() {
  // Attach to existing elements (capture phase)
  document.addEventListener('focus', handleFocus, true);
  document.addEventListener('blur', handleBlur, true);

  // Also listen for click events (helps with some websites)
  document.addEventListener('click', function(e) {
    if (isEditableField(e.target)) {
      setTimeout(() => handleFocus({target: e.target}), 100);
    }
  }, true);

  // NOTE: Auto-recheck on input disabled to prevent race conditions
  // Users should click the button to check, or wait for next major typing event
  
  console.log('CorrectNow extension loaded - Ready to check grammar');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

// Handle dynamic elements (only after body exists)
const observer = new MutationObserver(() => {
  // Re-attach listeners if needed
});

// Only observe if document.body exists
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
} else {
  // Wait for body to be available
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  });
}
