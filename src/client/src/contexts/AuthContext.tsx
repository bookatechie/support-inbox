/**
 * Authentication context and hooks
 * Manages user authentication state and provides auth methods
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { auth as authApi } from '@/lib/api';
import type { User, LoginRequest } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  clearUserCache: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          // Check cache first
          const cacheKey = 'support-inbox-current-user-cache';
          const cacheTimestampKey = 'support-inbox-current-user-cache-timestamp';
          const cachedData = sessionStorage.getItem(cacheKey);
          const cachedTimestamp = sessionStorage.getItem(cacheTimestampKey);
          const cacheMaxAge = 5 * 60 * 1000; // 5 minutes

          if (cachedData && cachedTimestamp) {
            const age = Date.now() - parseInt(cachedTimestamp, 10);
            if (age < cacheMaxAge) {
              setUser(JSON.parse(cachedData));
              setIsLoading(false);
              return;
            }
          }

          // Cache miss or expired, fetch from API
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);

          // Update cache
          sessionStorage.setItem(cacheKey, JSON.stringify(currentUser));
          sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
        } catch (error) {
          // Token is invalid, clear it
          localStorage.removeItem('authToken');
          sessionStorage.removeItem('support-inbox-current-user-cache');
          sessionStorage.removeItem('support-inbox-current-user-cache-timestamp');
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    const { token, user: loggedInUser } = await authApi.login(credentials);
    localStorage.setItem('authToken', token);
    setUser(loggedInUser);

    // Update cache on login
    const cacheKey = 'support-inbox-current-user-cache';
    const cacheTimestampKey = 'support-inbox-current-user-cache-timestamp';
    sessionStorage.setItem(cacheKey, JSON.stringify(loggedInUser));
    sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);

    // Clear cache on logout
    sessionStorage.removeItem('support-inbox-current-user-cache');
    sessionStorage.removeItem('support-inbox-current-user-cache-timestamp');
  };

  const clearUserCache = () => {
    // Clear the user cache (e.g., after profile update)
    sessionStorage.removeItem('support-inbox-current-user-cache');
    sessionStorage.removeItem('support-inbox-current-user-cache-timestamp');
  };

  const refreshUser = async () => {
    // Fetch fresh user data from API and update state
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);

      // Update cache
      const cacheKey = 'support-inbox-current-user-cache';
      const cacheTimestampKey = 'support-inbox-current-user-cache-timestamp';
      sessionStorage.setItem(cacheKey, JSON.stringify(currentUser));
      sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    clearUserCache,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
