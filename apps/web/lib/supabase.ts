import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzd2RqZGxpcnlseGdzY29oY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTA2MTgsImV4cCI6MjA5NjA2NjYxOH0.0QPuOB9V_poXv318LCg2jXJFRQN_4vmYdXJSQfAFkUM'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
}
