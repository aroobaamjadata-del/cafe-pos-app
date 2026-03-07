import { createClient } from '@supabase/supabase-js';

// ─── Supabase Configuration ────────────────────────────────────────────────────
// Replace these with your actual Supabase project URL and anon key
// from: https://supabase.com/dashboard → Project Settings → API
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckkbsvetdhpltycexodp.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra2JzdmV0ZGhwbHR5Y2V4b2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjU0NjIsImV4cCI6MjA4ODM0MTQ2Mn0.xjx6Y74lsj18HqH5mI3i38bG7Q6Zp_sGTLt98DrYCIY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }, // No auth session needed — we use license keys
  global: {
    headers: { 'x-application-name': 'cloud-n-cream-pos' }
  }
});

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY.length > 100 // JWT tokens are always well over 100 chars
  );
}
