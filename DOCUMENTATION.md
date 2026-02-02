# CorrectNow - Grammar & Spell Checking Platform

## Project Overview

CorrectNow is a comprehensive grammar and spell-checking platform consisting of three main components:

1. **Web Application** - React-based web interface
2. **Chrome Extension** - Browser extension for real-time grammar checking on any website
3. **Android WebView App** - Mobile application wrapping the web interface

---

## 1. Web Application

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Deployment**: Firebase Hosting

### Key Features Implemented

#### Core Editor
- Real-time proofreading with AI-powered suggestions
- Multiple language support (auto-detection)
- Word counter and character statistics
- Dark/light mode support
- Export to PDF functionality

#### Document Management
- Create, save, and organize documents
- Archive system for old documents
- **Bulk operations**: 
  - Select multiple archived documents with checkboxes
  - Delete selected or delete all archived documents
  - Selection counter showing selected items
- Real-time sync with Firebase Firestore
- Document change tracking

#### Blog System
- Public blog with full-width thumbnail display (`object-contain` for non-cropped images)
- Article management with rich text editor
- Category and tag system
- Comments with nested replies

#### User Features
- Authentication (Email/Password, Google OAuth)
- User profiles with avatar support
- Password reset functionality
- Free/Premium tier system with usage limits

#### Payment Integration
- Razorpay integration for premium subscriptions
- Multiple pricing plans
- Subscription management

### Project Structure
```
src/
├── components/          # Reusable UI components
│   ├── ProofreadingEditor.tsx
│   ├── ChangeLogTable.tsx
│   ├── WordCounter.tsx
│   └── ui/             # shadcn/ui components
├── pages/              # Route components
│   ├── Editor.tsx
│   ├── Dashboard.tsx
│   ├── Blog.tsx
│   ├── Pricing.tsx
│   └── Admin.tsx
├── lib/                # Utility functions
│   ├── firebase.ts     # Firebase configuration
│   ├── docs.ts         # Document operations
│   ├── suggestions.ts  # AI suggestions API
│   └── session.ts      # Session management
└── hooks/              # Custom React hooks
```

### Key Implementations

#### Document Bulk Delete Feature
```typescript
// Select archived documents with checkboxes
const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(new Set());

// Bulk delete with validation
const deleteSelectedArchived = async () => {
  await deleteArchivedDocsPermanently(Array.from(selectedArchivedIds));
  setSelectedArchivedIds(new Set());
};
```

#### Blog Thumbnail Display
Changed from cropped to full image visibility:
```css
/* Before: object-cover (cropped) */
/* After: object-contain (full image) */
img { object-fit: contain; }
```

---

## 2. Chrome Extension (MV3)

### Technology Stack
- **Framework**: TypeScript + Vite
- **Manifest**: Chrome Extension Manifest V3
- **UI**: Shadow DOM for isolation
- **Styling**: Inline CSS with data URIs

### Architecture

#### File Structure
```
chrome-extension/
├── src/
│   ├── contentScript.ts      # Main content script (injected into pages)
│   ├── background.ts          # Service worker for API calls
│   ├── popup/                 # Extension popup UI
│   └── shared/
│       ├── types.ts           # TypeScript interfaces
│       └── storage.ts         # Settings & storage management
├── manifest.json              # Extension configuration
└── dist/                      # Build output
```

### Core Features Implemented

#### 1. Auto-Check System
- **Always-on checking**: Removed user toggle, auto-check is permanently enabled
- **Smart debouncing**: 800ms delay after typing stops before checking
- **Focus detection**: Auto-checks when focusing on fields with 3+ characters
- **Correction-aware**: Prevents re-checking when applying corrections programmatically

```typescript
// Auto-check prevention flag
let isApplyingCorrection = false;

// Smart input handler
document.addEventListener("input", (e) => {
  if (isApplyingCorrection) return; // Don't check during corrections
  scheduleAutoCheck(activeEl);
});
```

#### 2. Visual Highlighting System
- **Red background overlays**: Semi-transparent red background with solid red border
- **Canvas-based measurement**: Accurate text positioning using Canvas 2D API
- **Hover effects**: Background darkens on hover for better UX
- **Clickable highlights**: Click any highlighted word to see suggestion

```typescript
// Highlight styling
.cn-underline {
  position: absolute;
  background: rgba(239, 68, 68, 0.2);
  border-bottom: 2px solid #ef4444;
  cursor: pointer;
}
```

#### 3. Smart Tooltip System
- **Positioned above word**: Tooltip appears at top-right of highlighted word
- **Viewport awareness**: Auto-adjusts position to stay within viewport bounds
- **One-click apply**: Click tooltip to instantly apply correction
- **Auto-hide**: Disappears after 5 seconds
- **Shows explanation**: Hover over tooltip to see grammar rule

```typescript
const showTooltip = (highlightRect: DOMRect, change: Change) => {
  // Position above and to the right
  const left = highlightRect.right + 5;
  const top = highlightRect.top - tooltipRect.height - 5;
  
  // Viewport boundary detection
  const finalLeft = Math.min(left, window.innerWidth - tooltipRect.width - 10);
  const finalTop = Math.max(10, top);
};
```

#### 4. Suggestion Panel
- **Floating UI**: Fixed position panel with Shadow DOM isolation
- **Smart positioning algorithm**: 4-priority positioning (right → left → below → above)
- **Red border styling**: 2px red border with strong shadows
- **Multiple actions**:
  - Apply individual suggestion
  - Apply all suggestions at once
  - Close panel
- **Detailed explanations**: Shows original text, corrected version, and grammar rule

#### 5. Widget Button
- **Visible design**: Large red button with hover effects
- **Positioned above input**: 50px above focused input field
- **Manual check trigger**: Click to manually check text
- **Viewport-aware**: Stays within visible area

#### 6. Text Measurement Approach
Evolved through multiple iterations to find the most reliable method:

**Final Implementation - Canvas API**:
```typescript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.font = computedStyle.font;

// Measure text position
const textBefore = text.substring(0, startIdx);
const textWidth = ctx.measureText(textBefore).width;
const wordWidth = ctx.measureText(original).width;

// Position highlight
highlight.style.left = `${rect.left + borderLeft + paddingLeft + textWidth}px`;
highlight.style.width = `${wordWidth}px`;
```

**Why Canvas API over Range API**:
- Simpler and more reliable
- No complex DOM manipulation
- Better performance
- Works consistently across all input types

#### 7. Correction Flow Prevention
Prevents infinite check loops when applying corrections:

```typescript
const setText = (el, value) => {
  isApplyingCorrection = true; // Set flag
  el.value = value;
  el.dispatchEvent(new Event("input"));
  setTimeout(() => {
    isApplyingCorrection = false; // Clear after 100ms
  }, 100);
};
```

**User Flow**:
1. User types text → Auto-check after 800ms
2. Wrong words highlighted in red
3. Click highlight → Tooltip appears above word
4. Click tooltip → Correction applied instantly
5. Highlights and panel clear immediately
6. No re-check until user types again

### Extension Permissions
```json
{
  "permissions": ["storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["contentScript.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### API Integration
- **Background service worker**: Handles all API calls to avoid CORS issues
- **Message passing**: Content script ↔ Background worker communication
- **Proofread endpoint**: POST request with text and language
- **Response handling**: Filters and validates grammar changes

---

## 3. Android WebView Application

### Technology Stack
- **Framework**: Expo (React Native)
- **WebView**: expo-webview
- **Build System**: EAS (Expo Application Services)

### Implementation Details

#### WebView Configuration
```typescript
import { WebView } from 'react-native-webview';

<WebView
  source={{ uri: 'https://your-app-url.com' }}
  javaScriptEnabled={true}
  domStorageEnabled={true}
  startInLoadingState={true}
  scalesPageToFit={true}
/>
```

### Key Features
- Full web app functionality in native Android container
- JavaScript execution enabled for full interactivity
- Local storage support for session persistence
- Loading state indicator
- Responsive scaling for different screen sizes

### Build Configuration
```json
{
  "expo": {
    "android": {
      "package": "com.correctnow.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

---

## Technical Highlights

### Chrome Extension - Technical Challenges Solved

#### Challenge 1: Underline Positioning
**Problem**: Initial Range API approach with mirror elements caused positioning offset issues

**Solution**: Switched to Canvas 2D API for text measurement
- More accurate and simpler
- No DOM manipulation overhead
- Consistent across all input types

#### Challenge 2: Repeated Suggestions After Apply
**Problem**: Applying corrections triggered auto-check, showing same suggestions again

**Solution**: Implemented correction-aware flag system
```typescript
let isApplyingCorrection = false;

// Prevent auto-check during programmatic changes
if (isApplyingCorrection) return;
```

#### Challenge 3: Panel Overlap with Input
**Problem**: Suggestion panel overlapped with input fields

**Solution**: 4-priority smart positioning algorithm
```typescript
// Priority: right → left → below → above
1. Try right of input
2. If no space, try left
3. If no space, try below
4. If no space, position above
```

#### Challenge 4: Shadow DOM Isolation
**Problem**: Page styles affecting extension UI

**Solution**: Shadow DOM with complete style encapsulation
```typescript
const shadow = host.attachShadow({ mode: "open" });
shadow.appendChild(style); // Isolated styles
```

### Performance Optimizations

1. **Debounced checking**: 800ms delay prevents excessive API calls
2. **Canvas reuse**: Single canvas element for all measurements
3. **Event delegation**: Minimal event listeners for highlights
4. **Lazy rendering**: Panel content rendered only when needed
5. **Cleanup on blur**: Removes highlights when leaving input field

---

## Development Workflow

### Web Application
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Deploy to Firebase
firebase deploy
```

### Chrome Extension
```bash
cd chrome-extension

# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Load extension in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select chrome-extension/dist folder
```

### Android App
```bash
cd android-expo-webview

# Install dependencies
npm install

# Start development server
npx expo start

# Build APK
npx expo build:android

# Build with EAS
eas build --platform android
```

---

## API Endpoints

### Proofread API
```typescript
POST /api/proofread
Content-Type: application/json

Request:
{
  "text": "string to check",
  "language": "auto" | "en" | "es" | "fr" | etc.
}

Response:
{
  "changes": [
    {
      "original": "wrong word",
      "corrected": "correct word",
      "explanation": "Grammar rule explanation",
      "type": "spelling" | "grammar" | "style"
    }
  ]
}
```

---

## Testing Checklist

### Chrome Extension
- [x] Auto-check on focus (3+ characters)
- [x] Auto-check after typing (800ms debounce)
- [x] Red highlights appear accurately
- [x] Tooltip shows above highlighted word
- [x] Tooltip stays in viewport
- [x] Click tooltip applies correction
- [x] No repeated suggestions after apply
- [x] Panel positions without overlap
- [x] Apply All button works correctly
- [x] Manual check button functional
- [x] Scroll updates positions
- [x] Resize updates positions
- [x] Works on input fields
- [x] Works on textarea fields
- [x] Works on contentEditable elements

### Web Application
- [x] Document CRUD operations
- [x] Bulk select archived documents
- [x] Delete selected/all archived
- [x] Blog thumbnails show full images
- [x] Export to PDF
- [x] Payment integration
- [x] Authentication flows

---

## Future Enhancements

### Chrome Extension
1. **Custom dictionary**: User-added words to ignore
2. **Grammar styles**: Formal, casual, business writing modes
3. **Keyboard shortcuts**: Quick apply with hotkeys
4. **Statistics**: Track corrections over time
5. **Multi-language**: Better language detection and switching

### Web Application
1. **Collaborative editing**: Real-time multi-user editing
2. **Version history**: Document revision tracking
3. **Templates**: Pre-made document templates
4. **API access**: Public API for integrations
5. **Advanced analytics**: Writing insights and trends

### Mobile App
1. **Native features**: Camera text scanning
2. **Offline mode**: Local grammar checking
3. **Voice input**: Speech-to-text with checking
4. **Share extension**: Check text from other apps

---

## Deployment

### Web App (Firebase)
```bash
# Build
npm run build

# Deploy
firebase deploy --only hosting
```

### Chrome Extension (Chrome Web Store)
1. Zip the `dist` folder
2. Upload to Chrome Web Store Developer Dashboard
3. Fill in store listing details
4. Submit for review

### Android App (Google Play)
```bash
# Build release APK
eas build --platform android --profile production

# Upload to Google Play Console
# 1. Create app listing
# 2. Upload APK
# 3. Fill in store details
# 4. Submit for review
```

---

## Credits

**Development Period**: January 2026  
**Technologies**: React, TypeScript, Firebase, Chrome Extensions API, Expo  
**AI Integration**: Google Gemini / OpenAI GPT for grammar checking

---

## License

Proprietary - All rights reserved

---

## Support

For issues or questions:
- Email: support@correctnow.com
- Documentation: [Link to docs]
- GitHub Issues: [Repository link]
