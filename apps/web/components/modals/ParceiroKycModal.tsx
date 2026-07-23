'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { ParceiroKycFields, KYC_VAZIO, type ParceiroKyc } from './ParceiroKycFields'

// Edita os dados de KYC de um parceiro JÁ cadastrado (para criar a subconta
// Asaas). Admin de sistema (RLS de parceiros é admin-only).
export function ParceiroKycModal({ parceiro, onClose, onSaved }: {
  parceiro: { id: string; nome: string; documento: string | null } & Partial<ParceiroKyc>
  onClose: () => void
  onSaved: (kyc: ParceiroKyc) => void
}) {
  const [kyc, setKyc] = useState<ParceiroKyc>({
    data_nascimento: parceiro.data_nascimento ?? null,
    tipo_empresa: parceiro.tipo_empresa ?? null,
    renda_mensal: parceiro.renda_mensal ?? null,
    cep: parceiro.cep ?? null,
    endereco: parceiro.endereco ?? null,
    endereco_numero: parceiro.endereco_numero ?? null,
    complemento: parceiro.complemento ?? null,
    bairro: parceiro.bairro ?? null,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    setSalvando(true)
    setErro('')
    const { error } = await createClient().from('parceiros')
      .update({ ...kyc, atualizado_em: new Date().toISOString() })
      .eq('id', parceiro.id)
    setSalvando(false)
    if (error) { setErro('Não foi possível salvar. Tente novamente.'); return }
    onSaved(kyc)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">Dados da conta Asaas — {parceiro.nome}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {erro && <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erro}</div>}
          <ParceiroKycFields
            documento={parceiro.documento ?? ''}
            value={kyc}
            onChange={patch => setKyc(prev => ({ ...prev, ...patch }))}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar dados'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { KYC_VAZIO }
