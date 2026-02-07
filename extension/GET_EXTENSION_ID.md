# 🔍 How to Get Your Extension ID

## Steps:

1. **Load the Extension in Chrome:**
   - Open Chrome and go to `chrome://extensions`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder from this project

2. **Copy the Extension ID:**
   - Look for "correctnow-naresh" in the extensions list
   - Under the extension name, you'll see an **ID** like: `abcdefghijklmnopqrstuvwxyz123456`
   - Click the copy icon next to the ID

3. **Update Auth.tsx:**
   - Open `src/pages/Auth.tsx`
   - Find line with: `const extensionId = 'YOUR_EXTENSION_ID';`
   - Replace `'YOUR_EXTENSION_ID'` with your actual extension ID
   - Example: `const extensionId = 'abcdefghijklmnopqrstuvwxyz123456';`

4. **Restart Development Server:**
   ```bash
   # Stop the dev server (Ctrl+C) and restart
   npm run dev
   ```

5. **Test the Integration:**
   - Click the extension icon → "Sign In / Register"
   - Log in on the website
   - The extension popup should now show your dashboard!

## Alternative: Use a Fixed ID (For Production)

When you publish to Chrome Web Store, you'll get a permanent extension ID. Use that instead.

## Troubleshooting:

**Extension ID changes every time:**
- This happens with unpacked extensions
- Generate a consistent ID by creating a `key` in manifest.json
- See: https://developer.chrome.com/docs/extensions/mv3/manifest/key/

**"Extension not responding" error:**
- Make sure the extension is loaded and enabled
- Check `externally_connectable` in manifest.json includes your website URL
- Verify the extension ID is correct

**Popup still shows login screen:**
- Open browser console (F12) on the auth page
- Look for `[Auth] ✅ Auth token sent to extension` message
- Check extension background console for received message
- Verify extension popup closes and reopens to see dashboard
