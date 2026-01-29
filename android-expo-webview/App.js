import React, { useCallback, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, Text, ActivityIndicator, Platform, SafeAreaView, StatusBar as RNStatusBar, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const START_URL = 'https://correctnow.app/';
const EXTERNAL_GOOGLE_URL = 'https://correctnow.app/auth?mode=login&autoGoogle=1';

const APP_SCHEME = 'correctnow://';
const GOOGLE_LOGIN_SCHEME = 'correctnow://google-login';

const isAllowedUrl = (url) => {
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('about:blank') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('file:') ||
    url.startsWith(APP_SCHEME)
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

  if (Platform.OS === 'web') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>This app is designed for Android only.</Text>
        <Text style={styles.errorText}>Please use: npx expo run:android</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
        onNavigationStateChange={(navState) => {
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
          if (request.url.startsWith(GOOGLE_LOGIN_SCHEME)) {
            Linking.openURL(EXTERNAL_GOOGLE_URL);
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
        mixedContentMode="compatibility"
        style={styles.webview}
      />
    </SafeAreaView>
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
