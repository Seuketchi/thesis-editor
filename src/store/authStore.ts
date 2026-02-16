import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => Promise<void>;
  signInWithGoogle: (isSignUp: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  init: () => () => void; // Returns a cleanup function
}

// Helper to clean URL after OAuth - removes fragments and codes to prevent refresh loops
const cleanUrl = () => {
  if (typeof window === 'undefined') return;
  
  const { href, pathname, search } = window.location;
  // Only clean if there's a hash (OAuth token) or auth-related search params
  if (href.includes('#') || search.includes('code=') || search.includes('error=')) {
    console.log('[Auth] Cleaning URL fragments/params');
    const url = new URL(href);
    
    // Clear known OAuth/Auth params
    ['code', 'error', 'error_description', 'error_code', 'state'].forEach(p => url.searchParams.delete(p));
    
    // Replace with clean URL (pathname + filtered search, no hash)
    const cleanPath = pathname + url.search;
    window.history.replaceState(null, '', cleanPath);
  }
};

// Track the active sync to prevent race conditions
let activeSyncPromise: Promise<void> | null = null;
let activeSyncUserId: string | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,
  
  setUser: async (user) => {
    // If no user, clear state and return
    if (!user) {
      activeSyncPromise = null;
      activeSyncUserId = null;
      set({ user: null, profile: null, loading: false });
      return;
    }

    // If already syncing this user, wait for existing promise
    if (activeSyncUserId === user.id && activeSyncPromise) {
      return activeSyncPromise;
    }

    // Start a new sync (singleton per user)
    activeSyncUserId = user.id;
    activeSyncPromise = (async () => {
      console.log('[Auth] sync-start:', user.email, 'UID:', user.id);
      set({ loading: true, error: null });

      const fetchProfile = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      };

      try {
        let profileData = await fetchProfile();
        if (!profileData) {
          await new Promise(r => setTimeout(r, 1000));
          profileData = await fetchProfile();
        }

        if (activeSyncUserId !== user.id) return;

        if (!profileData) {
          console.error('[Auth] Forbidden: No profile found for UID:', user.id);
          await supabase.auth.signOut();
          set({
            user: null,
            profile: null,
            loading: false,
            error: "Account Unauthorized: No profile record found. If you just signed up, please try refreshing in a moment.",
          });
          return;
        }

        set({ user, profile: profileData, loading: false, error: null });
      } catch (err: any) {
        if (activeSyncUserId === user.id) {
          console.error('[Auth] Fatal sync error:', err);
          set({ loading: false, error: err.message });
        }
      } finally {
        if (activeSyncUserId === user.id) {
          activeSyncPromise = null;
        }
      }
    })();

    return activeSyncPromise;
  },

  signInWithGoogle: async (isSignUp: boolean) => {
    set({ loading: true, error: null });
    try {
      const redirectTo = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent', // Always ask for consent for simplicity and better UX on re-auth
          },
          redirectTo,
        },
      });

      if (error) throw error;
      
    } catch (err: any) {
      console.error('[Auth] Google Sign-in error:', err);
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Signout error:', e);
    }
    set({ user: null, profile: null, error: null, loading: false });
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  },
  
  clearError: () => set({ error: null }),

  init: () => {
    console.log('[Auth] Initializing store...');
    
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          await get().setUser(session.user);
        } else {
          set({ profile: null, loading: false });
        }
      } catch (e) {
        console.error('[Auth] Init failed:', e);
        set({ loading: false });
      }
    };

    initializeAuth();

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] Event:', event);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          await get().setUser(session.user);
        }
        if (event !== 'INITIAL_SESSION') {
          setTimeout(cleanUrl, 0);
        } else if (session?.user) {
          cleanUrl();
        }
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, loading: false });
        activeSyncPromise = null;
        activeSyncUserId = null;
      }
    });

    return () => subscription.unsubscribe();
  },
}));
