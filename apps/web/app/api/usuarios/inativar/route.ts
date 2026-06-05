import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { usuarioId } = await req.json()
    if (!usuarioId) return NextResponse.json({ error: 'usuarioId obrigatório' }, { status: 400 })

    const supabase = createClient(
      'https://pswdjdlirylxgscohcfi.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzd2RqZGxpcnlseGdzY29oY2ZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ5MDYxOCwiZXhwIjoyMDk2MDY2NjE4fQ.W1ngY6tPoep-Y_Q-1y1O_iECR8Ww1j2pqjMfN1QAWlE',
    )

    const { error } = await supabase
      .from('usuarios')
      .update({ status: 'inativo' })
      .eq('id', usuarioId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
