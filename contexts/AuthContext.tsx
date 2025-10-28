import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

interface AuthContextProps {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextProps>({
  session: null,
  user: null,
  loading: true,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  error: null,
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  console.log("AuthContext initialized. Initial session state:", session);

  useEffect(() => {
    console.log("AuthContext useEffect running.");
    const fetchSession = async () => {
      console.log("Fetching initial session...");
      const { data: initialSession, error } = await supabase.auth.getSession();

      if (initialSession?.session) {
        console.log("Initial session fetched:", initialSession.session);
        setSession(initialSession.session);
        setUser(initialSession.session.user);
      } else {
        console.log("No initial session found or error fetching:", error);
        setSession(null);
        setUser(null);
      }
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed. Event:", event, "Session:", session);
      
      if (event === 'TOKEN_REFRESHED') {
        console.log("Token refreshed, updating session");
        setSession(session);
        setUser(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        console.log("User signed out, clearing session state.");
        setSession(null);
        setUser(null);
      } else if (session) {
        console.log("User signed in, updating session");
        setSession(session);
        setUser(session.user);
      }
    });

    // Cleanup function
    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, username: string) => {
    try {
      if (!isMounted.current) return;
      
      setError(null);
      setLoading(true);
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      if (!isMounted.current) return;
      
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      if (!isMounted.current) return;
      
      setError(null);
      setLoading(true);
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      if (!isMounted.current) return;
      
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const signOut = async () => {
    try {
      if (!isMounted.current) return;

      console.log('Attempting to sign out...');
      console.log('Current session state:', session);

      setError(null);
      setLoading(true);

      // First, ensure we have a valid session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        console.log('No active session found, clearing local state...');
        setSession(null);
        setUser(null);
        return;
      }

      // Now attempt to sign out
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('Supabase signOut error:', error);
        throw new Error(error.message);
      }

      console.log('Supabase signOut successful.');
      setSession(null);
      setUser(null);
    } catch (error: any) {
      console.error('Error during sign out:', error);

      if (!isMounted.current) return;

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred during sign out');
      }
      
      // Even if there's an error, try to clear local state and redirect
      setSession(null);
      setUser(null);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        console.log('Sign out process finished.');
      }
    }
  };

  const value = {
    session,
    user,
    loading,
    signUp,
    signIn,
    signOut,
    error,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};