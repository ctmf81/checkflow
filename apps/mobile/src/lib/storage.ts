// Storage local — SQLite via expo-sqlite
// Guarda checklists, catálogos, padrões, execuções e planos offline

import * as SQLite from 'expo-sqlite'
import type { Checklist, CatalogoValor, PadraoInstancia, ChecklistExecucao, PlanoAcaoRascunho, MotivoNaoExecucao } from './tipos'

const DB_NAME = 'checkflow.db'
const DB_VERSION = 1

export class OfflineStorage {
  private db: SQLite.SQLiteDatabase | null = null

  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME)
      await this.migrate()
    } catch (err) {
      console.error('Erro ao inicializar SQLite:', err)
      throw err
    }
  }

  private async migrate(): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')

    // Criar tabelas se não existirem
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT,
        tempo_guarda_meses INTEGER,
        subgrupo_id TEXT,
        unidade_id TEXT NOT NULL,
        versao INTEGER,
        estrutura TEXT NOT NULL,
        baixado_em INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalogo_valores (
        id TEXT PRIMARY KEY,
        catalogo_id TEXT NOT NULL,
        valor_chave TEXT NOT NULL,
        atributo_1 TEXT,
        atributo_2 TEXT,
        atributo_3 TEXT,
        atributo_4 TEXT,
        imagem_url TEXT
      );

      CREATE TABLE IF NOT EXISTS padrao_instancias (
        id TEXT PRIMARY KEY,
        padrao_id TEXT NOT NULL,
        valores TEXT NOT NULL,
        valor_min REAL,
        valor_max REAL
      );

      CREATE TABLE IF NOT EXISTS motivos_nao_execucao (
        id TEXT PRIMARY KEY,
        descricao TEXT NOT NULL,
        tipo TEXT CHECK(tipo IN ('checklist', 'atividade'))
      );

      CREATE TABLE IF NOT EXISTS execucoes (
        id TEXT PRIMARY KEY,
        checklist_id TEXT NOT NULL,
        unidade_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        data_inicio TEXT NOT NULL,
        data_conclusao TEXT,
        status TEXT CHECK(status IN ('em_andamento', 'concluido', 'nao_executado')),
        resultado TEXT CHECK(resultado IN ('aprovado', 'reprovado')),
        respostas TEXT NOT NULL,
        motivo_nao_execucao_id TEXT,
        motivo_nao_execucao_obs TEXT,
        sincronizado INTEGER DEFAULT 0,
        sincronizado_em TEXT
      );

      CREATE TABLE IF NOT EXISTS planos_rascunho (
        id TEXT PRIMARY KEY,
        checklist_execucao_id TEXT NOT NULL,
        atividade_id TEXT NOT NULL,
        status TEXT DEFAULT 'em_moderacao_n1',
        causa_raiz_id TEXT,
        observacao TEXT,
        sincronizado INTEGER DEFAULT 0,
        sincronizado_em TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_token (
        chave TEXT PRIMARY KEY,
        cpf TEXT NOT NULL,
        telefone TEXT NOT NULL,
        token TEXT NOT NULL,
        empresa_id TEXT NOT NULL,
        unidade_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `)
  }

  // ─── CHECKLISTS ───────────────────────────────────────────────────────

  async salvarChecklist(checklist: Checklist): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    const estrutura = JSON.stringify(checklist)
    const agora = Date.now()
    await this.db.runAsync(
      `INSERT OR REPLACE INTO checklists (id, nome, descricao, tempo_guarda_meses, subgrupo_id, unidade_id, versao, estrutura, baixado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        checklist.id,
        checklist.nome,
        checklist.descricao,
        checklist.tempo_guarda_meses,
        checklist.subgrupo_id,
        checklist.secoes[0]?.atividades[0]?.secao_id ?? '', // unidade_id vem da sessão
        checklist.versao,
        estrutura,
        agora
      ]
    )
  }

  async obterChecklist(id: string): Promise<Checklist | null> {
    if (!this.db) throw new Error('DB não inicializado')
    const result = await this.db.getFirstAsync<any>(
      'SELECT estrutura FROM checklists WHERE id = ?',
      [id]
    )
    return result ? JSON.parse(result.estrutura) : null
  }

  async listarChecklistsPreprados(unidadeId: string): Promise<Checklist[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<any>(
      'SELECT estrutura FROM checklists WHERE unidade_id = ? ORDER BY baixado_em DESC',
      [unidadeId]
    )
    return results.map(r => JSON.parse(r.estrutura))
  }

  // ─── CATÁLOGOS ────────────────────────────────────────────────────────

  async salvarCatalogosValores(valores: CatalogoValor[]): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    for (const v of valores) {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO catalogo_valores (id, catalogo_id, valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.id, v.catalogo_id, v.valor_chave, v.atributo_1, v.atributo_2, v.atributo_3, v.atributo_4, v.imagem_url]
      )
    }
  }

  async obterCatalogosValores(catalogoId: string): Promise<CatalogoValor[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<CatalogoValor>(
      'SELECT * FROM catalogo_valores WHERE catalogo_id = ? ORDER BY valor_chave ASC',
      [catalogoId]
    )
    return results
  }

  // ─── PADRÕES ──────────────────────────────────────────────────────────

  async salvarPadraoInstancias(instancias: PadraoInstancia[]): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    for (const inst of instancias) {
      const valores = JSON.stringify(inst.valores)
      await this.db.runAsync(
        `INSERT OR REPLACE INTO padrao_instancias (id, padrao_id, valores, valor_min, valor_max)
         VALUES (?, ?, ?, ?, ?)`,
        [inst.id, inst.padrao_id, valores, inst.valor_min, inst.valor_max]
      )
    }
  }

  async obterPadraoInstancias(padraoId: string): Promise<PadraoInstancia[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<any>(
      'SELECT * FROM padrao_instancias WHERE padrao_id = ?',
      [padraoId]
    )
    return results.map(r => ({ ...r, valores: JSON.parse(r.valores) }))
  }

  // ─── EXECUÇÕES ────────────────────────────────────────────────────────

  async salvarExecucao(execucao: ChecklistExecucao): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    const respostas = JSON.stringify(execucao.respostas)
    await this.db.runAsync(
      `INSERT OR REPLACE INTO execucoes
       (id, checklist_id, unidade_id, usuario_id, data_inicio, data_conclusao, status, resultado, respostas, motivo_nao_execucao_id, motivo_nao_execucao_obs, sincronizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        execucao.id,
        execucao.checklist_id,
        execucao.unidade_id,
        execucao.usuario_id,
        execucao.data_inicio,
        execucao.data_conclusao ?? null,
        execucao.status,
        execucao.resultado ?? null,
        respostas,
        execucao.motivo_nao_execucao_id ?? null,
        execucao.motivo_nao_execucao_obs ?? null,
        execucao.sincronizado ? 1 : 0
      ]
    )
  }

  async obterExecucao(id: string): Promise<ChecklistExecucao | null> {
    if (!this.db) throw new Error('DB não inicializado')
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM execucoes WHERE id = ?',
      [id]
    )
    if (!result) return null
    return {
      ...result,
      respostas: JSON.parse(result.respostas),
      sincronizado: result.sincronizado === 1
    }
  }

  async listarExecucoesPendentes(): Promise<ChecklistExecucao[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<any>(
      'SELECT * FROM execucoes WHERE sincronizado = 0 ORDER BY data_conclusao DESC'
    )
    return results.map(r => ({
      ...r,
      respostas: JSON.parse(r.respostas),
      sincronizado: r.sincronizado === 1
    }))
  }

  // ─── PLANOS DE AÇÃO (RASCUNHO) ────────────────────────────────────────

  async salvarPlanoRascunho(plano: PlanoAcaoRascunho): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    await this.db.runAsync(
      `INSERT OR REPLACE INTO planos_rascunho
       (id, checklist_execucao_id, atividade_id, status, causa_raiz_id, observacao, sincronizado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        plano.id,
        plano.checklist_execucao_id,
        plano.atividade_id,
        plano.status,
        plano.causa_raiz_id ?? null,
        plano.observacao ?? null,
        plano.sincronizado ? 1 : 0
      ]
    )
  }

  async listarPlanosRascunho(execucaoId: string): Promise<PlanoAcaoRascunho[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<any>(
      'SELECT * FROM planos_rascunho WHERE checklist_execucao_id = ?',
      [execucaoId]
    )
    return results.map(r => ({ ...r, sincronizado: r.sincronizado === 1 }))
  }

  async listarPlanosPendentes(): Promise<PlanoAcaoRascunho[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const results = await this.db.getAllAsync<any>(
      'SELECT * FROM planos_rascunho WHERE sincronizado = 0 ORDER BY checklist_execucao_id'
    )
    return results.map(r => ({ ...r, sincronizado: r.sincronizado === 1 }))
  }

  // ─── MOTIVOS ──────────────────────────────────────────────────────────

  async salvarMotivos(motivos: MotivoNaoExecucao[]): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    for (const m of motivos) {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO motivos_nao_execucao (id, descricao, tipo) VALUES (?, ?, ?)',
        [m.id, m.descricao, m.tipo]
      )
    }
  }

  async obterMotivos(tipo?: 'checklist' | 'atividade'): Promise<MotivoNaoExecucao[]> {
    if (!this.db) throw new Error('DB não inicializado')
    const query = tipo
      ? 'SELECT * FROM motivos_nao_execucao WHERE tipo = ? ORDER BY descricao'
      : 'SELECT * FROM motivos_nao_execucao ORDER BY descricao'
    const results = await this.db.getAllAsync<MotivoNaoExecucao>(query, tipo ? [tipo] : [])
    return results
  }

  // ─── AUTH TOKEN ────────────────────────────────────────────────────────

  async salvarAuthToken(token: { cpf: string; telefone: string; token: string; empresaId: string; unidadeId: string; usuarioId: string; expiresAt: string }): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    await this.db.runAsync(
      `INSERT OR REPLACE INTO auth_token (chave, cpf, telefone, token, empresa_id, unidade_id, usuario_id, expires_at)
       VALUES ('current', ?, ?, ?, ?, ?, ?, ?)`,
      [token.cpf, token.telefone, token.token, token.empresaId, token.unidadeId, token.usuarioId, token.expiresAt]
    )
  }

  async obterAuthToken() {
    if (!this.db) throw new Error('DB não inicializado')
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM auth_token WHERE chave = ?',
      ['current']
    )
    return result ?? null
  }

  async limpar(): Promise<void> {
    if (!this.db) throw new Error('DB não inicializado')
    // Limpar todas as tabelas
    await this.db.execAsync(`
      DELETE FROM checklists;
      DELETE FROM catalogo_valores;
      DELETE FROM padrao_instancias;
      DELETE FROM motivos_nao_execucao;
      DELETE FROM execucoes;
      DELETE FROM planos_rascunho;
    `)
  }
}

export const storage = new OfflineStorage()
