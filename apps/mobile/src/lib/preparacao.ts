// Lógica de preparação offline
// Download de checklist + catálogos + padrões + motivos

import axios from 'axios'
import { storage } from './storage'
import type { Checklist, CatalogoValor, PadraoInstancia, MotivoNaoExecucao } from './tipos'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'

export interface ProgressoDownload {
  etapa: 'checklist' | 'catalogo' | 'padroes' | 'motivos' | 'completo'
  percentual: number // 0-100
  bytesDownload: number
  bytesEstimado: number
}

export interface ResultadoPreparacao {
  sucesso: boolean
  checklistId: string
  checklistNome: string
  bytesArmazenados: number
  erro?: string
}

/**
 * Baixa tudo que é necessário para executar um checklist offline
 */
export async function prepararChecklistOffline(
  checklistId: string,
  unidadeId: string,
  token: string,
  onProgresso?: (prog: ProgressoDownload) => void
): Promise<ResultadoPreparacao> {
  const resultado: ResultadoPreparacao = {
    sucesso: false,
    checklistId,
    checklistNome: '',
    bytesArmazenados: 0
  }

  try {
    let bytesTotal = 0

    // ─── 1. BAIXA CHECKLIST ──────────────────────────────────────────
    onProgresso?.({ etapa: 'checklist', percentual: 0, bytesDownload: 0, bytesEstimado: 0 })

    const checklistRes = await axios.get<{ data: Checklist }>(
      `${API_URL}/api/checklists/${checklistId}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    )
    const checklist = checklistRes.data.data
    resultado.checklistNome = checklist.nome

    const checklistBytes = JSON.stringify(checklist).length
    bytesTotal += checklistBytes

    await storage.salvarChecklist(checklist)
    onProgresso?.({ etapa: 'checklist', percentual: 25, bytesDownload: bytesTotal, bytesEstimado: bytesTotal })

    // ─── 2. BAIXA CATÁLOGOS ──────────────────────────────────────────
    onProgresso?.({ etapa: 'catalogo', percentual: 25, bytesDownload: bytesTotal, bytesEstimado: bytesTotal })

    // Extrai IDs únicos de catálogos do checklist
    const catalogoIds = new Set<string>()
    const visitarAtividades = (atividades: any[]) => {
      atividades.forEach(a => {
        if (a.config?.catalogo_id) catalogoIds.add(a.config.catalogo_id)
        if (a.dependentes) visitarAtividades(a.dependentes)
      })
    }
    checklist.secoes.forEach(s => visitarAtividades(s.atividades))

    for (const catalogoId of catalogoIds) {
      try {
        const valoresRes = await axios.get<{ data: CatalogoValor[] }>(
          `${API_URL}/api/catalogos/${catalogoId}/valores`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        )
        const valores = valoresRes.data.data

        await storage.salvarCatalogosValores(valores)

        const valoresBytes = JSON.stringify(valores).length
        bytesTotal += valoresBytes

        onProgresso?.({
          etapa: 'catalogo',
          percentual: 25 + Math.min(25, (bytesTotal / (bytesTotal + 1)) * 25),
          bytesDownload: bytesTotal,
          bytesEstimado: bytesTotal
        })
      } catch (error) {
        console.warn(`Erro ao baixar catálogo ${catalogoId}:`, error)
      }
    }

    // ─── 3. BAIXA PADRÕES ────────────────────────────────────────────
    onProgresso?.({ etapa: 'padroes', percentual: 50, bytesDownload: bytesTotal, bytesEstimado: bytesTotal })

    const padraoIds = new Set<string>()
    const visitarAtividades2 = (atividades: any[]) => {
      atividades.forEach(a => {
        if (a.config?.padrao_id) padraoIds.add(a.config.padrao_id)
        if (a.dependentes) visitarAtividades2(a.dependentes)
      })
    }
    checklist.secoes.forEach(s => visitarAtividades2(s.atividades))

    for (const padraoId of padraoIds) {
      try {
        const instRes = await axios.get<{ data: PadraoInstancia[] }>(
          `${API_URL}/api/padroes/${padraoId}/instancias`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        )
        const instancias = instRes.data.data

        await storage.salvarPadraoInstancias(instancias)

        const instBytes = JSON.stringify(instancias).length
        bytesTotal += instBytes

        onProgresso?.({
          etapa: 'padroes',
          percentual: 50 + Math.min(25, (bytesTotal / (bytesTotal + 1)) * 25),
          bytesDownload: bytesTotal,
          bytesEstimado: bytesTotal
        })
      } catch (error) {
        console.warn(`Erro ao baixar padrão ${padraoId}:`, error)
      }
    }

    // ─── 4. BAIXA MOTIVOS ────────────────────────────────────────────
    onProgresso?.({ etapa: 'motivos', percentual: 75, bytesDownload: bytesTotal, bytesEstimado: bytesTotal })

    try {
      const motivosRes = await axios.get<{ data: MotivoNaoExecucao[] }>(
        `${API_URL}/api/checklists/${checklistId}/motivos`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      )
      const motivos = motivosRes.data.data

      await storage.salvarMotivos(motivos)

      const motivosBytes = JSON.stringify(motivos).length
      bytesTotal += motivosBytes
    } catch (error) {
      console.warn('Erro ao baixar motivos:', error)
    }

    // ─── SUCESSO ──────────────────────────────────────────────────────
    resultado.sucesso = true
    resultado.bytesArmazenados = bytesTotal

    onProgresso?.({
      etapa: 'completo',
      percentual: 100,
      bytesDownload: bytesTotal,
      bytesEstimado: bytesTotal
    })

    return resultado
  } catch (error: any) {
    resultado.erro = error.message || 'Erro ao preparar checklist offline'
    console.error('Erro em prepararChecklistOffline:', error)
    return resultado
  }
}

/**
 * Lista checklists já preparados offline
 */
export async function listarChecklistsPreprados(unidadeId: string): Promise<Checklist[]> {
  return storage.listarChecklistsPreprados(unidadeId)
}

/**
 * Remove checklist preparado offline
 */
export async function removerChecklistOffline(checklistId: string): Promise<void> {
  const exec = await storage.obterExecucao(checklistId)
  if (exec) {
    throw new Error('Não é possível remover checklist com execuções em andamento')
  }
  // TODO: implementar método em storage.ts
  console.warn('removerChecklistOffline: ainda não implementado')
}
