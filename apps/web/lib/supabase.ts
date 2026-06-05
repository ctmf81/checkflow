import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://pswdjdlirylxgscohcfi.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Ub9LtVXjBvrRrO-kCsAbCg_qCcxvfH4'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
}
