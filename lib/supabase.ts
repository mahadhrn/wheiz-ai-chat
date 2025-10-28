import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Implement a web-compatible storage adapter
const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(window.localStorage.getItem(key));
    } catch (e) {
      return Promise.resolve(null);
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve();
    }
    try {
      window.localStorage.setItem(key, value);
      return Promise.resolve();
    } catch (e) {
      return Promise.resolve();
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return Promise.resolve();
    }
    try {
      window.localStorage.removeItem(key);
      return Promise.resolve();
    } catch (e) {
      return Promise.resolve();
    }
  },
};

// Use platform-specific storage implementation
const storage = Platform.OS === 'web' ? webStorage : {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    debug: false,
  },
  global: {
    headers: {
      'x-application-name': 'wheiz',
    },
  },
});