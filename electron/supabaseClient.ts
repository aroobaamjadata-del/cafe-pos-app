import { createClient } from '@supabase/supabase-js';

// Ensure you load these securely in production (e.g., via dotenv or Electron context)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckkbsvetdhpltycexodp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra2JzdmV0ZGhwbHR5Y2V4b2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjU0NjIsImV4cCI6MjA4ODM0MTQ2Mn0.xjx6Y74lsj18HqH5mI3i38bG7Q6Zp_sGTLt98DrYCIY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // Desktop POS doesn't need web sessions for this flow
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: { 'x-application-name': 'electron-pos' }
  }
});
