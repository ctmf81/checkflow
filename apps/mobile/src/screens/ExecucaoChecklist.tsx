// Tela de execução offline — COMPLETA
// Reutiliza validações, engine, storage, componentes por tipo

import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native'
import { useRoute } from '@react-navigation/native'
import { v4 as uuid } from 'uuid'
import { storage } from '@/lib/storage'
import { calcularValidacao, calcularProgresso, listarAtividadesVisiveis } from '@/lib/validacoes'
import { calcularResultadoGlobal } from '@/lib/checklistEngine'
import { CampoFactory } from '@/components/CampoFactory'
import type { Checklist, ChecklistExecucao, Atividade } from '@/lib/tipos'

interface RouteParams {
  checklistId: string
  execucaoId?: string // Se retomando
}

export function ExecucaoChecklistScreen() {
  const route = useRoute()
  const params = route.params as RouteParams
  const { checklistId, execucaoId } = params

  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [execucao, setExecucao] = useState<ChecklistExecucao | null>(null)
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Carregar checklist e execução
  useEffect(() => {
    const carregar = async () => {
      try {
        const ckl = await storage.obterChecklist(checklistId)
        if (!ckl) throw new Error('Checklist não encontrado')
        setChecklist(ckl)

        // Se retomando, carrega respostas anteriores
        if (execucaoId) {
          const exec = await storage.obterExecucao(execucaoId)
          if (exec) {
            setExecucao(exec)
            setRespostas(exec.respostas)
          }
        } else {
          // Nova execução
          setExecucao({
            id: uuid(),
            checklist_id: checklistId,
            unidade_id: '', // vem do context
            usuario_id: '', // vem do context
            data_inicio: new Date().toISOString(),
            status: 'em_andamento',
            respostas: {},
            sincronizado: false
          } as ChecklistExecucao)
        }
      } catch (error) {
        console.error('Erro ao carregar:', error)
        Alert.alert('Erro', 'Não conseguimos carregar o checklist')
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [checklistId, execucaoId])

  // Calcula progresso
  const progresso = checklist ? calcularProgresso(checklist.secoes, respostas) : { total: 0, respondidas: 0 }
  const percentual = progresso.total > 0 ? Math.round((progresso.respondidas / progresso.total) * 100) : 0

  // Lista atividades visíveis (respeitando dependências)
  const visiveis = checklist ? listarAtividadesVisiveis(checklist.secoes, respostas) : []

  // Atualiza resposta de uma atividade
  const handleResposta = (atividade: Atividade, valor: any) => {
    const novaResposta = { ...respostas, [atividade.id]: valor }
    setRespostas(novaResposta)

    // Salva em tempo real em SQLite (draft)
    if (execucao) {
      execucao.respostas = novaResposta
      storage.salvarExecucao(execucao)
    }
  }

  // Finaliza execução
  const handleFinalizar = async () => {
    if (!execucao || !checklist) return

    try {
      setSalvando(true)

      // Lista atividades visíveis obrigatórias não respondidas
      const pendentes = visiveis.filter(a => a.obrigatoria && !respostas[a.id])
      if (pendentes.length > 0) {
        Alert.alert(
          'Campos obrigatórios',
          `Preencha: ${pendentes.map(a => a.nome).join(', ')}`
        )
        setSalvando(false)
        return
      }

      // Calcula resultado
      const resultado = calcularResultadoGlobal(visiveis)

      // Salva execução
      const execFinal: ChecklistExecucao = {
        ...execucao,
        data_conclusao: new Date().toISOString(),
        status: 'concluido',
        resultado,
        respostas,
        sincronizado: false
      }

      await storage.salvarExecucao(execFinal)

      // Se houver não conformidades com gera_plano_acao → cria planos rascunho
      for (const a of visiveis) {
        if (a.gera_plano_acao && calcularValidacao(a) === false) {
          await storage.salvarPlanoRascunho({
            id: uuid(),
            checklist_execucao_id: execFinal.id,
            atividade_id: a.id,
            status: 'em_moderacao_n1',
            sincronizado: false
          })
        }
      }

      Alert.alert(
        'Sucesso',
        `Checklist finalizado como ${resultado}.\nQuando estiver online, os dados serão sincronizados.`,
        [{ text: 'OK', onPress: () => {} }]
      )
    } catch (error) {
      console.error('Erro ao finalizar:', error)
      Alert.alert('Erro', 'Não conseguimos finalizar o checklist')
    } finally {
      setSalvando(false)
    }
  }

  if (loading || !checklist || !execucao) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Carregando...</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ padding: 16, backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderColor: '#ddd' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{checklist.nome}</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: '#666' }}>
            {progresso.respondidas} / {progresso.total}
          </Text>
          <Text style={{ fontSize: 12, color: '#666' }}>
            {percentual}%
          </Text>
        </View>
        {/* Barra de progresso (simplificada) */}
        <View style={{ marginTop: 4, height: 4, backgroundColor: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ height: '100%', backgroundColor: '#4CAF50', width: `${percentual}%` }} />
        </View>
      </View>

      {/* Atividades */}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {checklist.secoes.map(secao => (
          <View key={secao.id} style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>{secao.nome}</Text>

            {visiveis
              .filter(a => a.secao_id === secao.id)
              .map(atividade => {
                const validacao = calcularValidacao(atividade)
                const cor = validacao === true ? '#4CAF50' : validacao === false ? '#F44336' : '#999'

                return (
                  <View key={atividade.id} style={{ marginBottom: 16, padding: 12, backgroundColor: '#fff', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: cor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', flex: 1 }}>
                        {atividade.nome}
                        {atividade.obrigatoria && <Text style={{ color: 'red' }}> *</Text>}
                      </Text>
                      {/* Ícone de tipo */}
                      <View style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: cor,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Text style={{ fontSize: 11, color: '#fff', fontWeight: 'bold' }}>
                          {atividade.tipo.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Componente por tipo (factory) */}
                    <CampoFactory
                      atividade={atividade}
                      resposta={respostas[atividade.id]}
                      onChange={(v) => handleResposta(atividade, v)}
                    />

                    {/* Validação */}
                    {validacao !== null && (
                      <Text style={{ marginTop: 8, fontSize: 12, color: cor, fontWeight: '600' }}>
                        {validacao ? '✓ Conforme' : '✗ Não conforme'}
                      </Text>
                    )}
                  </View>
                )
              })}
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={{ padding: 16, backgroundColor: '#f5f5f5', borderTopWidth: 1, borderColor: '#ddd' }}>
        <Pressable
          onPress={handleFinalizar}
          disabled={salvando || progresso.respondidas < progresso.total}
          style={{
            padding: 12,
            backgroundColor: progresso.respondidas === progresso.total ? '#4CAF50' : '#ccc',
            borderRadius: 4,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            {salvando ? 'Salvando...' : 'Finalizar Checklist'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

