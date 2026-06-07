'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Props {
  visible: boolean
  texto: string
  versao: string
  onAceitar: () => void
}

export function TermosDeUsoModal({ visible, texto, versao, onAceitar }: Props) {
  const [salvando, setSalvando] = useState(false)
  const [lido, setLido] = useState(false)

  useEffect(() => {
    if (visible) setLido(false)
  }, [visible])

  if (!visible) return null

  async function aceitar() {
    setSalvando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('usuarios').update({
        termos_aceitos_em: new Date().toISOString(),
        termos_versao_aceita: versao,
      }).eq('id', user.id)
    }
    setSalvando(false)
    onAceitar()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <ShieldCheck size={20} className="text-orange-500" />
          <h2 className="text-lg font-semibold text-slate-800">Termo de Uso e Tratamento de Dados</h2>
        </div>

        <div
          className="overflow-y-auto px-6 py-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed flex-1"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setLido(true)
          }}
        >
          {texto}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {!lido && (
            <p className="text-xs text-amber-600 mb-2">Role até o final do texto para habilitar o aceite.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={aceitar} disabled={!lido || salvando}>
              {salvando ? 'Registrando...' : 'Li e aceito os termos'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
