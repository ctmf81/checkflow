// Sincronização com backend — quando volta online
// POST /api/checklist/sincronizar (novo RPC)

import axios from 'axios'
import { storage } from './storage'
import type { ChecklistExecucao, PlanoAcaoRascunho, SincronizacaoPayload } from './tipos'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'

interface SincronizacaoStatus {
  sucesso: boolean
  execucoesEnviadas: number
  planosEnviados: number
  erros: string[]
  timestamp: string
}

/**
 * Sincroniza execuções e planos pendentes com o servidor.
 * Chamado quando volta online.
 */
export async function sincronizar(token: string): Promise<SincronizacaoStatus> {
  const status: SincronizacaoStatus = {
    sucesso: false,
    execucoesEnviadas: 0,
    planosEnviados: 0,
    erros: [],
    timestamp: new Date().toISOString()
  }

  try {
    // Busca dados pendentes
    const execucoes = await storage.listarExecucoesPendentes()
    const planos = await storage.listarPlanosPendentes()

    if (execucoes.length === 0 && planos.length === 0) {
      status.sucesso = true
      return status
    }

    const payload: SincronizacaoPayload = {
      execucoes,
      planos,
      timestamp: new Date().toISOString()
    }

    // POST para o servidor
    const response = await axios.post(
      `${API_URL}/api/checklist/sincronizar`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )

    const { data } = response

    // Marca como sincronizado
    for (const exec of execucoes) {
      exec.sincronizado = true
      exec.sincronizado_em = new Date().toISOString()
      await storage.salvarExecucao(exec)
    }

    for (const plano of planos) {
      plano.sincronizado = true
      plano.sincronizado_em = new Date().toISOString()
      await storage.salvarPlanoRascunho(plano)
    }

    status.sucesso = true
    status.execucoesEnviadas = execucoes.length
    status.planosEnviados = planos.length

    return status
  } catch (error: any) {
    status.sucesso = false

    if (error.response?.status === 401) {
      status.erros.push('Sessão expirada. Faça login novamente.')
    } else if (error.response?.status === 400) {
      status.erros.push(`Validação: ${error.response.data?.message || 'dados inválidos'}`)
    } else if (error.code === 'ECONNREFUSED') {
      status.erros.push('Servidor indisponível. Tente novamente mais tarde.')
    } else {
      status.erros.push(error.message || 'Erro desconhecido na sincronização')
    }

    console.error('Erro ao sincronizar:', error)
    return status
  }
}

/**
 * Verifica se há conexão com a internet.
 */
export async function temInternet(): Promise<boolean> {
  try {
    const response = await axios.get(
      `${API_URL}/api/health`,
      { timeout: 5000 }
    )
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * Monitora conexão e sincroniza automaticamente quando volta online.
 */
export function iniciarMonitorConexao(token: string, onSincronizado?: (status: SincronizacaoStatus) => void) {
  let ultimoStatus = false

  const verificar = async () => {
    const agora = await temInternet()

    // Voltou online → sincroniza
    if (agora && !ultimoStatus) {
      console.log('[Sincronização] Conexão restaurada, sincronizando...')
      const status = await sincronizar(token)
      if (onSincronizado) onSincronizado(status)
    }

    ultimoStatus = agora
  }

  // Verifica a cada 10s
  const interval = setInterval(verificar, 10000)
  verificar() // Checagem inicial

  return () => clearInterval(interval) // cleanup
}
