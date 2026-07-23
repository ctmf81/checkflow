'use client'

import { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { ParceiroKycFields, type ParceiroKyc } from './ParceiroKycFields'

// Edição de um parceiro já cadastrado: dados básicos + KYC da subconta Asaas.
// Admin de sistema (RLS de parceiros é admin-only).
//
// Regra do documento: CPF/CNPJ é editável enquanto NÃO houver subconta Asaas.
// Depois de criada, o documento fica travado — o cadastro local não pode
// divergir da conta financeira real (o repasse do split vai para aquela conta).

export interface ParceiroEditavel extends Partial<ParceiroKyc> {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  asaas_wallet_id: string | null
}

function formatDoc(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

export function ParceiroEditarModal({ parceiro, onClose, onSaved }: {
  parceiro: ParceiroEditavel
  onClose: () => void
  onSaved: (patch: Partial<ParceiroEditavel>) => void
}) {
  const temConta = !!parceiro.asaas_wallet_id

  const [nome, setNome] = useState(parceiro.nome)
  const [email, setEmail] = useState(parceiro.email)
  const [telefone, setTelefone] = useState(parceiro.telefone ?? '')
  const [documento, setDocumento] = useState(formatDoc(parceiro.documento ?? ''))
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

  const docDigits = documento.replace(/\D/g, '')

  async function salvar() {
    setErro('')
    if (!nome.trim()) { setErro('Informe o nome.'); return }
    if (!email.trim()) { setErro('Informe o e-mail.'); return }
    if (!temConta && docDigits.length !== 11 && docDigits.length !== 14) {
      setErro('Informe um CPF (11) ou CNPJ (14 dígitos).'); return
    }

    setSalvando(true)
    const patch: Partial<ParceiroEditavel> = {
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      telefone: telefone.trim() || null,
      ...kyc,
      // Documento só vai no update enquanto não há subconta (travado depois).
      ...(temConta ? {} : { documento: docDigits }),
    }
    const { error } = await createClient().from('parceiros')
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq('id', parceiro.id)
    setSalvando(false)

    if (error) {
      setErro(error.code === '23505'
        ? 'Já existe outro parceiro com este CPF/CNPJ ou e-mail.'
        : 'Não foi possível salvar. Tente novamente.')
      return
    }
    onSaved(patch)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">Editar parceiro</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erro && <div className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2">{erro}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <p className="text-xs text-gray-400 mb-1">Recebe as boas-vindas e o resumo mensal de comissões.</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(xx) xxxxx-xxxx" className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CPF / CNPJ {temConta && <Lock size={11} className="inline text-gray-400" />}
            </label>
            <input
              value={documento}
              onChange={e => setDocumento(formatDoc(e.target.value))}
              disabled={temConta} inputMode="numeric"
              className={`${input} ${temConta ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            {temConta && (
              <p className="text-xs text-amber-600 mt-1">
                A subconta Asaas já foi criada com este documento — por isso ele não pode mais ser alterado aqui.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Dados da conta Asaas</p>
            <ParceiroKycFields
              documento={docDigits}
              value={kyc}
              onChange={patch => setKyc(prev => ({ ...prev, ...patch }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
