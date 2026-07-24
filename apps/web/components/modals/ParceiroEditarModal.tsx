'use client'

import { useState } from 'react'
import { X, Lock, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { ParceiroKycFields, type ParceiroKyc } from './ParceiroKycFields'

// Edição de um parceiro já cadastrado: dados básicos + status + KYC + wallet.
// Admin de sistema (RLS de parceiros é admin-only).
//
// Regra do documento: CPF/CNPJ é editável enquanto NÃO houver subconta Asaas
// (wallet vazio) — o cadastro local não pode divergir da conta financeira real.
// Limpar o campo do wallet destrava o documento (escape hatch consciente).

export interface ParceiroEditavel extends Partial<ParceiroKyc> {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  status: 'ativo' | 'inativo'
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export function ParceiroEditarModal({ parceiro, onClose, onSaved, onExcluido }: {
  parceiro: ParceiroEditavel
  onClose: () => void
  onSaved: (patch: Partial<ParceiroEditavel>) => void
  onExcluido: (id: string) => void
}) {
  const [nome, setNome] = useState(parceiro.nome)
  const [email, setEmail] = useState(parceiro.email)
  const [telefone, setTelefone] = useState(parceiro.telefone ?? '')
  const [documento, setDocumento] = useState(formatDoc(parceiro.documento ?? ''))
  const [status, setStatus] = useState<'ativo' | 'inativo'>(parceiro.status)
  const [walletId, setWalletId] = useState(parceiro.asaas_wallet_id ?? '')
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
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  // Trava o documento pela subconta JÁ PERSISTIDA (não pelo campo em edição):
  // uma vez criada a wallet, o CPF/CNPJ não muda mais — o documento é o que
  // identifica a conta financeira real que recebe o repasse.
  const temConta = !!parceiro.asaas_wallet_id
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
      status,
      asaas_wallet_id: walletId.trim() || null,
      ...kyc,
      ...(temConta ? {} : { documento: docDigits }),
    }
    const supabase = createClient()
    const { error } = await supabase.from('parceiros')
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq('id', parceiro.id)

    if (error) {
      setSalvando(false)
      setErro(error.code === '23505'
        ? 'Já existe outro parceiro com este CPF/CNPJ ou e-mail.'
        : 'Não foi possível salvar. Tente novamente.')
      return
    }

    // Status ou wallet mudaram → o split das assinaturas VIGENTES precisa
    // refletir (inativo/sem wallet = sem repasse). Sem isso, desativar um
    // parceiro deixaria o dinheiro continuar sendo dividido. Best-effort.
    if (status !== parceiro.status || (walletId.trim() || null) !== parceiro.asaas_wallet_id) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const { data: vinculos } = await supabase.from('empresa_financeiro')
          .select('empresa_id').eq('parceiro_id', parceiro.id)
        await Promise.all((vinculos ?? []).map(v =>
          fetch(`${API_URL}/billing/sincronizar-split`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
            body: JSON.stringify({ empresaId: (v as any).empresa_id }),
          }).catch(() => null)
        ))
      } catch { /* Asaas fora — o split se ajusta na próxima troca de plano */ }
    }

    setSalvando(false)
    onSaved(patch)
  }

  async function excluir() {
    setErro('')
    setExcluindo(true)
    const supabase = createClient()

    // Guarda: empresa_financeiro.parceiro_id é ON DELETE SET NULL — excluir um
    // parceiro vinculado desligaria o repasse da empresa em silêncio.
    const { data: vinculos } = await supabase.from('empresa_financeiro')
      .select('empresa:empresa_id(nome)').eq('parceiro_id', parceiro.id)
    if (vinculos && vinculos.length > 0) {
      const nomes = (vinculos as any[])
        .map(v => (Array.isArray(v.empresa) ? v.empresa[0] : v.empresa)?.nome)
        .filter(Boolean).join(', ')
      setExcluindo(false)
      setConfirmandoExclusao(false)
      setErro(`Não dá para excluir: o parceiro está vinculado a ${vinculos.length} empresa(s)${nomes ? ` (${nomes})` : ''}. Desvincule na aba Parceiro de cada empresa antes.`)
      return
    }

    const { error } = await supabase.from('parceiros').delete().eq('id', parceiro.id)
    setExcluindo(false)
    if (error) { setErro('Não foi possível excluir. Tente novamente.'); return }
    onExcluido(parceiro.id)
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
                A subconta Asaas já foi criada com este documento — ele não pode mais ser alterado. É por ele que o Asaas identifica a conta que recebe o repasse.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'ativo' | 'inativo')} className={input}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
            {status === 'inativo' && (
              <p className="text-xs text-amber-600 mt-1">
                Parceiro inativo <b>não recebe split</b> em novas cobranças nem o resumo mensal de comissões.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Dados da conta Asaas</p>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Wallet ID</label>
              <p className="text-xs text-gray-400 mb-1">
                Subconta que recebe o repasse do split. Preenchido pelo botão “Criar conta Asaas” — só edite manualmente se souber o ID correto.
              </p>
              <input value={walletId} onChange={e => setWalletId(e.target.value)}
                placeholder="(sem conta — use o botão Criar conta Asaas)"
                className={`${input} font-mono text-xs`} />
            </div>

            <ParceiroKycFields
              documento={docDigits}
              value={kyc}
              onChange={patch => setKyc(prev => ({ ...prev, ...patch }))}
              ocultarRenda
            />
          </div>

          {/* Exclusão */}
          <div className="pt-3 border-t border-gray-100">
            {confirmandoExclusao ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-red-900">Excluir {parceiro.nome}?</p>
                    <p className="text-xs text-red-700 mt-0.5">
                      A ação não pode ser desfeita.{temConta ? ' A subconta no Asaas NÃO é apagada — remova por lá se precisar.' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => setConfirmandoExclusao(false)}>Cancelar</Button>
                  <button onClick={excluir} disabled={excluindo}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                    {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setErro(''); setConfirmandoExclusao(true) }}
                className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium">
                <Trash2 size={13} /> Excluir parceiro
              </button>
            )}
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
