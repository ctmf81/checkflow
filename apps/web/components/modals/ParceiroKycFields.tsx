'use client'

// Campos de KYC exigidos pelo Asaas para criar a subconta (split de parceiro).
// Compartilhado entre o cadastro de parceiro novo (ParceiroModal) e a edição
// de um parceiro existente (ParceiroKycModal). PF (CPF) mostra data de
// nascimento; PJ (CNPJ) mostra tipo de empresa.

export interface ParceiroKyc {
  data_nascimento: string | null
  tipo_empresa: string | null
  renda_mensal: number | null
  cep: string | null
  endereco: string | null
  endereco_numero: string | null
  complemento: string | null
  bairro: string | null
}

export const KYC_VAZIO: ParceiroKyc = {
  data_nascimento: null, tipo_empresa: null, renda_mensal: null,
  cep: null, endereco: null, endereco_numero: null, complemento: null, bairro: null,
}

const TIPOS_EMPRESA: { value: string; label: string }[] = [
  { value: 'MEI', label: 'MEI' },
  { value: 'LIMITED', label: 'Ltda' },
  { value: 'INDIVIDUAL', label: 'Empresário individual' },
  { value: 'ASSOCIATION', label: 'Associação' },
]

const input = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200'

export function ParceiroKycFields({ documento, value, onChange }: {
  documento: string // só dígitos (define PF x PJ)
  value: ParceiroKyc
  onChange: (patch: Partial<ParceiroKyc>) => void
}) {
  const ehPj = documento.replace(/\D/g, '').length === 14
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Dados exigidos pelo Asaas para criar a subconta do parceiro (repasse do split).</p>

      {ehPj ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de empresa</label>
          <select value={value.tipo_empresa ?? ''} onChange={e => onChange({ tipo_empresa: e.target.value || null })} className={input}>
            <option value="">Selecione…</option>
            {TIPOS_EMPRESA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data de nascimento</label>
          <input type="date" value={value.data_nascimento ?? ''} onChange={e => onChange({ data_nascimento: e.target.value || null })} className={input} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{ehPj ? 'Faturamento mensal (R$)' : 'Renda mensal (R$)'}</label>
        <input type="number" min={0} step="0.01" inputMode="decimal"
          value={value.renda_mensal ?? ''} onChange={e => onChange({ renda_mensal: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="0,00" className={input} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
          <input value={value.cep ?? ''} onChange={e => onChange({ cep: e.target.value || null })} placeholder="00000-000" inputMode="numeric" className={input} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
          <input value={value.bairro ?? ''} onChange={e => onChange({ bairro: e.target.value || null })} className={input} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
          <input value={value.endereco ?? ''} onChange={e => onChange({ endereco: e.target.value || null })} placeholder="Rua / Avenida" className={input} />
        </div>
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
          <input value={value.endereco_numero ?? ''} onChange={e => onChange({ endereco_numero: e.target.value || null })} className={input} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Complemento <span className="text-gray-400 font-normal">(opcional)</span></label>
        <input value={value.complemento ?? ''} onChange={e => onChange({ complemento: e.target.value || null })} className={input} />
      </div>
    </div>
  )
}
