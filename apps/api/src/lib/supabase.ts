import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SECRET_KEY!

// Node 20 não tem WebSocket nativo — `ws` evita crash do RealtimeClient
export const supabase = createClient(url, key, { realtime: { transport: ws as any } })
