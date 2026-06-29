'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// Espelho local do contexto resolvido (empresa/unidade/labels), para que o
// operador em campo (offline) continue funcionando sem precisar revalidar a
// sessão no servidor. Base da execução offline (Fase 2).
const SESSION_CACHE_KEY = 'checkflow:session-ctx'

type Ambiente = 'gestao' | 'operacao' | 'sistema'

interface Unidade { id: string; nome: string }
interface Empresa { id: string; nome: string }

interface SessionState {
  ambiente: Ambiente
  empresaAtiva: Empresa | null
  unidadeAtiva: Unidade | null
  unidades: Unidade[]
  empresas: Empresa[]
  precisaEscolherEmpresa: boolean
  modoEmpresa: boolean
  grupoLabel: string    // ex: "Grupo", "Setor", "Departamento"
  subgrupoLabel: string // ex: "Subgrupo", "Área", "Loja"
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
  precisaEscolherEmpresa: false,
  modoEmpresa: false,
  grupoLabel: 'Grupo',
  subgrupoLabel: 'Subgrupo',
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
  const [precisaEscolherEmpresa, setPrecisaEscolherEmpresa] = useState(false)
  const [modoEmpresa, setModoEmpresa] = useState(false)
  const [grupoLabel, setGrupoLabel] = useState('Grupo')
  const [subgrupoLabel, setSubgrupoLabel] = useState('Subgrupo')

  useEffect(() => {
    const supabase = createClient()

    // Reidrata o contexto (empresa/unidade/labels) a partir do último estado
    // salvo online. Usado quando estamos offline e getUser() não pode validar.
    function rehydrateFromCache(userId: string) {
      try {
        const raw = localStorage.getItem(SESSION_CACHE_KEY)
        if (!raw) return
        const c = JSON.parse(raw)
        if (c.userId !== userId) return
        if (c.ambiente) setAmbienteState(c.ambiente)
        if (Array.isArray(c.empresas)) setEmpresas(c.empresas)
        if (Array.isArray(c.unidades)) setUnidades(c.unidades)
        if (c.empresaAtiva) setEmpresaAtivaState(c.empresaAtiva)
        if (c.unidadeAtiva) setUnidadeAtivaState(c.unidadeAtiva)
        setModoEmpresa(!!c.modoEmpresa)
        if (c.grupoLabel) setGrupoLabel(c.grupoLabel)
        if (c.subgrupoLabel) setSubgrupoLabel(c.subgrupoLabel)
      } catch { /* cache corrompido: ignora */ }
    }

    async function init() {
      // Sessão armazenada localmente (localStorage, sem rede). Sem ela não há
      // login — nem online nem offline.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // getUser() valida o token no servidor (precisa de rede). Offline, ela
      // falha — então caímos no contexto cacheado da última vez online, e o
      // operador continua com empresa/unidade definidas em vez de ser jogado
      // para a tela de login.
      let user
      try {
        const res = await supabase.auth.getUser()
        if (res.error) throw res.error
        user = res.data.user
      } catch {
        user = null
      }
      if (!user) {
        rehydrateFromCache(session.user.id)
        return
      }

      const isAdmin = user.user_metadata?.role === 'admin_sistema'

      // Carrega as empresas do usuário numa lista LOCAL. NÃO dá pra ler o state
      // `empresas` recém-setado na mesma execução: setState é assíncrono, então
      // `empresas` ficaria vazio (stale) e o usuário cairia em "Nenhuma empresa
      // selecionada" no login (bug histórico para admin da empresa / não-admins).
      let minhasEmpresas: Empresa[] = []
      if (isAdmin) {
        const { data: emps } = await supabase.from('empresas').select('id, nome').order('nome')
        minhasEmpresas = emps ?? []
      } else {
        const { data: ue } = await supabase
          .from('usuario_empresa')
          .select('empresa:empresa_id(id, nome)')
          .eq('usuario_id', user.id)
        minhasEmpresas = (ue ?? []).map((r: any) => r.empresa).filter(Boolean)
      }
      setEmpresas(minhasEmpresas)

      // Carrega sessão salva
      const { data: sessao } = await supabase
        .from('sessao_usuario')
        .select('ultimo_ambiente, ultima_unidade_id, ultima_empresa_id')
        .eq('usuario_id', user.id)
        .single()

      if (sessao) setAmbienteState(sessao.ultimo_ambiente as Ambiente)

      if (minhasEmpresas.length > 1) {
        // Tenta restaurar a última empresa usada
        const ultimaEmpresa = sessao?.ultima_empresa_id
          ? minhasEmpresas.find(e => e.id === sessao.ultima_empresa_id) ?? null
          : null

        if (ultimaEmpresa) {
          // Restaura sem perguntar
          setEmpresaAtivaState(ultimaEmpresa)
          if (isAdmin) setModoEmpresa(true)
          const lista = await carregarUnidades(ultimaEmpresa.id, user.id, isAdmin)
          if (sessao?.ultima_unidade_id) {
            const uni = lista.find(u => u.id === sessao.ultima_unidade_id)
            if (uni) { setUnidadeAtivaState(uni); carregarLabels(uni.id) }
            else if (lista.length > 0) { setUnidadeAtivaState(lista[0]); carregarLabels(lista[0].id) }
          } else if (lista.length > 0) {
            setUnidadeAtivaState(lista[0])
            carregarLabels(lista[0].id)
          }
          return
        }

        // Sem sessão salva: pede escolha
        setPrecisaEscolherEmpresa(true)
        return
      }

      if (minhasEmpresas.length === 1) {
        const emp = minhasEmpresas[0]
        setEmpresaAtivaState(emp)
        if (isAdmin) setModoEmpresa(true)
        const lista = await carregarUnidades(emp.id, user.id, isAdmin)

        if (sessao?.ultima_unidade_id) {
          const uni = lista.find(u => u.id === sessao.ultima_unidade_id)
          if (uni) {
            setUnidadeAtivaState(uni)
            carregarLabels(uni.id)
          } else if (lista.length > 0) {
            setUnidadeAtivaState(lista[0])
            carregarLabels(lista[0].id)
            salvarSessao({ ultima_unidade_id: lista[0].id })
          }
        } else if (lista.length > 0) {
          setUnidadeAtivaState(lista[0])
          carregarLabels(lista[0].id)
          salvarSessao({ ultima_unidade_id: lista[0].id })
        }
      }
      // Sem empresa nenhuma: usuário precisa ser configurado pelo admin
    }

    init()
  }, [])

  // Espelha o contexto resolvido no localStorage para reidratação offline.
  // Dispara sempre que empresa/unidade/labels mudam (já online).
  useEffect(() => {
    if (!empresaAtiva || !unidadeAtiva) return
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      try {
        localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
          userId: session.user.id, ambiente, empresaAtiva, unidadeAtiva,
          unidades, empresas, modoEmpresa, grupoLabel, subgrupoLabel,
        }))
      } catch { /* cota/modo privado: ignora */ }
    })
  }, [ambiente, empresaAtiva, unidadeAtiva, unidades, empresas, modoEmpresa, grupoLabel, subgrupoLabel])

  async function carregarUnidades(empresaId: string, userId: string, isAdmin: boolean): Promise<Unidade[]> {
    const supabase = createClient()
    let lista: Unidade[] = []

    // Admin de sistema OU admin da empresa (perfil ...002) enxerga TODAS as
    // unidades da empresa. Demais veem só as suas (usuario_unidade).
    let veTodas = isAdmin
    if (!veTodas) {
      const { data: vinc } = await supabase
        .from('usuario_empresa')
        .select('perfil_id')
        .eq('usuario_id', userId)
        .eq('empresa_id', empresaId)
        .maybeSingle()
      veTodas = vinc?.perfil_id === '00000000-0000-0000-0000-000000000002'
    }

    if (veTodas) {
      const { data } = await supabase.from('unidades').select('id, nome').eq('empresa_id', empresaId).order('nome')
      lista = data ?? []
    } else {
      const { data } = await supabase
        .from('usuario_unidade')
        .select('unidade:unidade_id(id, nome)')
        .eq('usuario_id', userId)
      lista = (data ?? []).map((r: any) => r.unidade).filter(Boolean)
    }
    setUnidades(lista)
    return lista
  }

  async function carregarLabels(unidadeId: string) {
    const { data } = await createClient()
      .from('unidades')
      .select('grupo_label, subgrupo_label')
      .eq('id', unidadeId)
      .single()
    if (data) {
      setGrupoLabel(data.grupo_label || 'Grupo')
      setSubgrupoLabel(data.subgrupo_label || 'Subgrupo')
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
    setPrecisaEscolherEmpresa(false)
    salvarSessao({ ultima_empresa_id: e?.id ?? null, ultima_unidade_id: null })
    if (e) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const isAdmin = user.user_metadata?.role === 'admin_sistema'
        setModoEmpresa(isAdmin)
        const lista = await carregarUnidades(e.id, user.id, isAdmin)
        // Auto-seleciona a primeira unidade (padrão)
        if (lista.length > 0) {
          setUnidadeAtivaState(lista[0])
          salvarSessao({ ultima_unidade_id: lista[0].id })
        }
      }
    } else {
      setModoEmpresa(false)
    }
  }, [])

  const setUnidadeAtiva = useCallback((u: Unidade | null) => {
    setUnidadeAtivaState(u)
    salvarSessao({ ultima_unidade_id: u?.id ?? null })
    if (u?.id) carregarLabels(u.id)
    else { setGrupoLabel('Grupo'); setSubgrupoLabel('Subgrupo') }
  }, [])

  return (
    <SessionContext.Provider value={{
      ambiente, empresaAtiva, unidadeAtiva, unidades, empresas,
      precisaEscolherEmpresa, modoEmpresa, grupoLabel, subgrupoLabel,
      setAmbiente, setEmpresaAtiva, setUnidadeAtiva,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
