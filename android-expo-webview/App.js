import React, { useCallback, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, Text, ActivityIndicator, Platform, StatusBar as RNStatusBar, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const WEB_URL = 'https://correctnow.app/';
const START_URL = WEB_URL;
const EXTERNAL_GOOGLE_URL = `${WEB_URL}auth?mode=login&autoGoogle=1&returnToApp=true`;

const isAllowedUrl = (url) => {
  // Block custom scheme to prevent "Can't open url" warnings
  if (url.startsWith('correctnow://')) {
    return false;
  }
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('about:blank') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('file:')
  );
};

export default function App() {
  const webViewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadTimeoutRef = useRef(null);

  // Set a timeout for loading
  const startLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(() => {
      if (loading) {
        setError('Connection timeout. Please check your network connection.');
        setLoading(false);
      }
    }, 20000); // 20 second timeout
  }, [loading]);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const onAndroidBackPress = useCallback(() => {
    if (canGoBackRef.current && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onAndroidBackPress
      );
      return () => subscription.remove();
    }
  }, [onAndroidBackPress]);

  // Handle deep link redirects from browser after login
  React.useEffect(() => {
    const handleDeepLink = (event) => {
      console.log('[DeepLink] ===== DEEP LINK RECEIVED =====');
      console.log('[DeepLink] Full event:', JSON.stringify(event));
      console.log('[DeepLink] URL:', event.url);
      
      if (event.url && event.url.startsWith('correctnow://')) {
        console.log('[DeepLink] ✓ CorrectNow deep link detected!');
        console.log('[DeepLink] Reloading WebView to refresh session');
        
        if (webViewRef.current) {
          // Reload the WebView to pick up the new login session
          webViewRef.current.reload();
        }
      } else {
        console.log('[DeepLink] ✗ Not a correctnow:// link');
      }
    };

    console.log('[DeepLink] Setting up deep link listener');
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    // Check if app was opened via deep link
    Linking.getInitialURL().then(url => {
      if (url) {
        console.log('[DeepLink] Initial URL on app start:', url);
        handleDeepLink({ url });
      } else {
        console.log('[DeepLink] No initial URL');
      }
    }).catch(err => {
      console.error('[DeepLink] Error getting initial URL:', err);
    });

    return () => {
      console.log('[DeepLink] Removing listener');
      subscription.remove();
    };
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>This app is designed for Android only.</Text>
        <Text style={styles.errorText}>Please use: npx expo run:android</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <StatusBar style="dark" translucent={false} backgroundColor="#fff" />
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading CorrectNow...</Text>
        </View>
      )}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load</Text>
          <Text style={styles.errorSubText}>{error}</Text>
          <Text style={styles.errorSubText}>URL: {START_URL}</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: START_URL }}
        injectedJavaScript={`
          (function() {
            console.log('[Injected] Checking native bridge...');
            if (window.ReactNativeWebView) {
              console.log('[Injected] ✓ Native bridge exists!');
              console.log('[Injected] Bridge type:', typeof window.ReactNativeWebView.postMessage);
            } else {
              console.error('[Injected] ✗ Native bridge missing!');
            }
            true;
          })();
        `}
        onNavigationStateChange={(navState) => {
          console.log('[Navigation]', navState.url);
          canGoBackRef.current = navState.canGoBack;
        }}
        onLoadStart={() => {
          setLoading(true);
          setError(null);
          startLoadTimeout();
        }}
        onLoadEnd={() => {
          clearLoadTimeout();
          setLoading(false);
        }}
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent.progress >= 0.9) {
            setLoading(false);
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (!request?.url) {
            return false;
          }
          // Block custom scheme navigation - handled by onMessage instead
          if (request.url.startsWith('correctnow://')) {
            return false;
          }
          return isAllowedUrl(request.url);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
          clearLoadTimeout();
          setError(nativeEvent.description || 'Unknown error');
          setLoading(false);
        }}
        onMessage={(event) => {
          console.log('[onMessage] ===== EVENT RECEIVED =====');
          console.log('[onMessage] Full event:', JSON.stringify(event));
          const data = event?.nativeEvent?.data || '';
          console.log('[onMessage] Data extracted:', data, 'Type:', typeof data);
          
          if (data === 'google-login') {
            console.log('[onMessage] ✓ Google login message matched!');
            console.log('[onMessage] Target URL:', EXTERNAL_GOOGLE_URL);
            
            Linking.openURL(EXTERNAL_GOOGLE_URL)
              .then(() => {
                console.log('[Linking] ✓ SUCCESS! Browser opened');
              })
              .catch(error => {
                console.error('[Linking] ✗ ERROR:', error);
                console.error('[Linking] Error name:', error?.name);
                console.error('[Linking] Error message:', error?.message);
              });
          } else {
            console.log('[onMessage] ✗ Message mismatch. Expected: \"google-login\", Got:', JSON.stringify(data));
          }
        }}
        onHttpError={(syntheticEvent) => {
          console.error('HTTP error:', syntheticEvent.nativeEvent);
        }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        cacheEnabled={false}
        incognito={false}
        mixedContentMode="compatibility"
        style={styles.webview}
      />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: (RNStatusBar.currentHeight || 0) + 8,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  urlText: {
    marginTop: 10,
    fontSize: 12,
    color: '#666',
  },
  hintText: {
    marginTop: 5,
    fontSize: 11,
    color: '#999',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff0000',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorSubText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
  },
});
