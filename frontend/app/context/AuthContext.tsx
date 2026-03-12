import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { router } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  balances: { LTC: number; TRX: number; JST: number };
  consecutive_days: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sessionToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
    
    // Handle deep links for cold start
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleAuthRedirect(url);
      }
    });

    // Handle web hash on mount
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes('session_id=')) {
        const sessionId = extractSessionId(hash);
        if (sessionId) {
          processSessionId(sessionId);
        }
      }
    }
  }, []);

  const extractSessionId = (urlOrHash: string): string | null => {
    // Try hash format first
    const hashMatch = urlOrHash.match(/[#?]session_id=([^&]+)/);
    if (hashMatch) return hashMatch[1];
    
    // Try query format
    const queryMatch = urlOrHash.match(/[?&]session_id=([^&#]+)/);
    if (queryMatch) return queryMatch[1];
    
    return null;
  };

  const handleAuthRedirect = async (url: string) => {
    const sessionId = extractSessionId(url);
    if (sessionId) {
      await processSessionId(sessionId);
    }
  };

  const processSessionId = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await AsyncStorage.setItem('session_token', data.session_token);
          setSessionToken(data.session_token);
          setUser(data.user);
          
          // Clean URL hash on web
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          
          // Navigate to dashboard
          router.replace('/(tabs)/dashboard');
        }
      } else {
        const errorData = await response.json();
        console.error('Auth error:', errorData.detail);
        alert(errorData.detail || 'Authentication failed');
      }
    } catch (error) {
      console.error('Error processing session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingSession = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        setSessionToken(token);
        const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Session expired, clear storage
          await AsyncStorage.removeItem('session_token');
          setSessionToken(null);
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    setIsLoading(true);
    try {
      // Platform-specific redirect URL
      const redirectUrl = Platform.OS === 'web'
        ? `${BACKEND_URL}/`
        : Linking.createURL('/');

      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === 'web') {
        // Web: direct redirect
        window.location.href = authUrl;
      } else {
        // Mobile: use WebBrowser
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          await handleAuthRedirect(result.url);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (sessionToken) {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.removeItem('session_token');
      setSessionToken(null);
      setUser(null);
      router.replace('/');
    }
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
        sessionToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
