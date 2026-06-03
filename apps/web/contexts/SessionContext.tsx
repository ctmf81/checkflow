'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Ambiente = 'gestao' | 'operacao' | 'sistema'

interface Unidade { id: string; nome: string }
interface Empresa { id: string; nome: string }

interface SessionState {
  ambiente: Ambiente
  empresaAtiva: Empresa | null
  unidadeAtiva: Unidade | null
  unidades: Unidade[]
  empresas: Empresa[]
  modoEmpresa: boolean // admin de sistema acessando empresa específica
  setAmbiente: (a: Ambiente) => void
  setEmpresaAtiva: (e: Empresa | null) => void
  setUnidadeAtiva: (u: Unidade | null) => void
}

const SessionContext = createContext<SessionState>({
  ambiente: 'gestao',
  empresaAtiva: null,
  unidadeAtiva: null,
  unidades: [],
  empresas: [],
  modoEmpresa: false,
  setAmbiente: () => {},
  setEmpresaAtiva: () => {},
  setUnidadeAtiva: () => {},
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ambiente, setAmbienteState] = useState<Ambiente>('gestao')
  const [empresaAtiva, setEmpresaAtivaState] = useState<Empresa | null>(null)
  const [unidadeAtiva, setUnidadeAtivaState] = useState<Unidade | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modoEmpresa, setModoEmpresa] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const isAdmin = user.user_metadata?.role === 'admin_sistema'

      // Carrega empresas
      if (isAdmin) {
        const { data: emps } = await supabase.from('empresas').select('id, nome').order('nome')
        if (emps) setEmpresas(emps)
      } else {
        const { data: ue } = await supabase
          .from('usuario_empresa')
          .select('empresa:empresa_id(id, nome)')
          .eq('usuario_id', user.id)
        if (ue) setEmpresas(ue.map((r: any) => r.empresa).filter(Boolean))
      }

      // Carrega sessão salva
      const { data: sessao } = await supabase
        .from('sessao_usuario')
        .select('ultimo_ambiente, ultima_empresa_id, ultima_unidade_id')
        .eq('usuario_id', user.id)
        .single()

      if (sessao) {
        setAmbienteState(sessao.ultimo_ambiente as Ambiente)

        if (sessao.ultima_empresa_id) {
          const { data: emp } = await supabase
            .from('empresas').select('id, nome').eq('id', sessao.ultima_empresa_id).single()
          if (emp) {
            setEmpresaAtivaState(emp)
            if (isAdmin) setModoEmpresa(true)
            // Carrega unidades dessa empresa
            await carregarUnidades(sessao.ultima_empresa_id, user.id, isAdmin)
          }
        }

        if (sessao.ultima_unidade_id) {
          const { data: uni } = await supabase
            .from('unidades').select('id, nome').eq('id', sessao.ultima_unidade_id).single()
          if (uni) setUnidadeAtivaState(uni)
        }
      }
    }

    init()
  }, [])

  async function carregarUnidades(empresaId: string, userId: string, isAdmin: boolean) {
    const supabase = createClient()
    if (isAdmin) {
      const { data } = await supabase.from('unidades').select('id, nome').eq('empresa_id', empresaId).order('nome')
      if (data) setUnidades(data)
    } else {
      const { data } = await supabase
        .from('usuario_unidade')
        .select('unidade:unidade_id(id, nome)')
        .eq('usuario_id', userId)
      if (data) setUnidades(data.map((r: any) => r.unidade).filter(Boolean))
    }
  }

  async function salvarSessao(updates: Partial<{ ultimo_ambiente: string; ultima_empresa_id: string | null; ultima_unidade_id: string | null }>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('sessao_usuario').upsert({ usuario_id: user.id, atualizado_em: new Date().toISOString(), ...updates })
  }

  const setAmbiente = useCallback((a: Ambiente) => {
    setAmbienteState(a)
    salvarSessao({ ultimo_ambiente: a })
  }, [])

  const setEmpresaAtiva = useCallback(async (e: Empresa | null) => {
    setEmpresaAtivaState(e)
    setUnidadeAtivaState(null)
    setUnidades([])
    salvarSessao({ ultima_empresa_id: e?.id ?? null, ultima_unidade_id: null })
    if (e) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const isAdmin = user.user_metadata?.role === 'admin_sistema'
        setModoEmpresa(isAdmin)
        await carregarUnidades(e.id, user.id, isAdmin)
      }
    } else {
      setModoEmpresa(false)
    }
  }, [])

  const setUnidadeAtiva = useCallback((u: Unidade | null) => {
    setUnidadeAtivaState(u)
    salvarSessao({ ultima_unidade_id: u?.id ?? null })
  }, [])

  return (
    <SessionContext.Provider value={{
      ambiente, empresaAtiva, unidadeAtiva, unidades, empresas,
      modoEmpresa, setAmbiente, setEmpresaAtiva, setUnidadeAtiva,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
