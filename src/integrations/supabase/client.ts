import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { authStorage, isNativePlatform, platformStorageKey } from '@/lib/auth/auth-storage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
//
// Storage is platform-aware (encrypted keystore on native, localStorage on web)
// and is owned by @/lib/auth/auth-storage. Never hardcode `storage: localStorage`.

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: authStorage,
    storageKey: platformStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    // Native uses a HashRouter shell with no OAuth redirect surface.
    detectSessionInUrl: !isNativePlatform,
  }
});
