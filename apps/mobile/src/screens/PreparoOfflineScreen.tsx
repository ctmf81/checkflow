// Tela de preparação offline
// Operador seleciona checklists e baixa pra offline

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  SafeAreaView
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import axios from 'axios'
import { Download, Trash2, CheckCircle, AlertCircle } from 'lucide-react-native'
import { prepararChecklistOffline, listarChecklistsPreprados, type ProgressoDownload } from '@/lib/preparacao'
import { useSession } from '@/contexts/SessionContext' // assumindo que existe
import { storage } from '@/lib/storage'
import type { Checklist } from '@/lib/tipos'

interface ChecklistPreparado {
  id: string
  nome: string
  status: 'preparado' | 'preparando' | 'erro'
  bytesArmazenados: number
  percentual: number
  erro?: string
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'
const TAMANHO_MB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2)

export function PreparoOfflineScreen() {
  const navigation = useNavigation()
  const { token, unidadeId } = useSession() // contexto de sessão
  const [checklists, setChecklists] = useState<ChecklistPreparado[]>([])
  const [modalAberta, setModalAberta] = useState(false)
  const [listaDisponivelModal, setListaDisponivelModal] = useState<any[]>([])
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [totalArmazenado, setTotalArmazenado] = useState(0)

  // Carrega lista de preparados ao montar
  useEffect(() => {
    const carregar = async () => {
      try {
        const preparados = await listarChecklistsPreprados(unidadeId)
        const items = preparados.map(ckl => ({
          id: ckl.id,
          nome: ckl.nome,
          status: 'preparado' as const,
          bytesArmazenados: 0, // TODO: calcular realmente
          percentual: 100
        }))
        setChecklists(items)

        const total = items.reduce((sum, i) => sum + i.bytesArmazenados, 0)
        setTotalArmazenado(total)
      } catch (error) {
        console.error('Erro ao carregar preparados:', error)
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [unidadeId])

  // Abre modal e lista disponíveis
  const abrirModal = async () => {
    setModalAberta(true)
    setCarregandoLista(true)

    try {
      // Busca checklists disponíveis da unidade
      const res = await axios.get<{ data: any[] }>(
        `${API_URL}/api/checklists?unidade=${unidadeId}&status=publicado`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setListaDisponivelModal(res.data.data)
    } catch (error) {
      Alert.alert('Erro', 'Não conseguimos listar checklists')
      console.error(error)
    } finally {
      setCarregandoLista(false)
    }
  }

  // Inicia preparação de um checklist
  const iniciarPreparacao = async (checklistId: string, nome: string) => {
    // Adiciona à lista com status "preparando"
    setChecklists(prev => [...prev, {
      id: checklistId,
      nome,
      status: 'preparando',
      bytesArmazenados: 0,
      percentual: 0
    }])

    try {
      const resultado = await prepararChecklistOffline(
        checklistId,
        unidadeId,
        token,
        (progresso: ProgressoDownload) => {
          // Atualiza progresso
          setChecklists(prev => prev.map(c =>
            c.id === checklistId
              ? { ...c, percentual: progresso.percentual, bytesArmazenados: progresso.bytesDownload }
              : c
          ))
        }
      )

      if (resultado.sucesso) {
        setChecklists(prev => prev.map(c =>
          c.id === checklistId
            ? { ...c, status: 'preparado', bytesArmazenados: resultado.bytesArmazenados, percentual: 100 }
            : c
        ))
        setTotalArmazenado(prev => prev + resultado.bytesArmazenados)
        setModalAberta(false)
      } else {
        setChecklists(prev => prev.map(c =>
          c.id === checklistId
            ? { ...c, status: 'erro', erro: resultado.erro }
            : c
        ))
      }
    } catch (error: any) {
      setChecklists(prev => prev.map(c =>
        c.id === checklistId
          ? { ...c, status: 'erro', erro: error.message }
          : c
      ))
    }
  }

  const removerPreparado = (id: string) => {
    Alert.alert(
      'Remover',
      'Deseja remover este checklist offline?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            const removed = checklists.find(c => c.id === id)
            setChecklists(prev => prev.filter(c => c.id !== id))
            if (removed) {
              setTotalArmazenado(prev => prev - removed.bytesArmazenados)
            }
          }
        }
      ]
    )
  }

  const abrirChecklist = (id: string) => {
    // Navega para tela de execução
    navigation.navigate('ExecucaoChecklist', { checklistId: id })
  }

  // Renderiza item de checklist preparado
  const renderItem = ({ item }: { item: ChecklistPreparado }) => (
    <View
      style={{
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: item.status === 'erro' ? '#F44336' : '#ddd'
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>{item.nome}</Text>
          <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            {TAMANHO_MB(item.bytesArmazenados)} MB
          </Text>
        </View>

        {item.status === 'preparado' && <CheckCircle size={20} color="#4CAF50" />}
        {item.status === 'preparando' && <ActivityIndicator size="small" color="#2196F3" />}
        {item.status === 'erro' && <AlertCircle size={20} color="#F44336" />}
      </View>

      {item.status === 'preparando' && (
        <View style={{ marginBottom: 8 }}>
          <View style={{ height: 4, backgroundColor: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                backgroundColor: '#2196F3',
                width: `${item.percentual}%`
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{item.percentual}%</Text>
        </View>
      )}

      {item.status === 'erro' && (
        <Text style={{ fontSize: 12, color: '#F44336', marginBottom: 8 }}>{item.erro}</Text>
      )}

      {item.status === 'preparado' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => abrirChecklist(item.id)}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#4CAF50',
              borderRadius: 4,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Abrir</Text>
          </Pressable>

          <Pressable
            onPress={() => removerPreparado(item.id)}
            style={{
              padding: 8,
              backgroundColor: '#f5f5f5',
              borderRadius: 4,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Trash2 size={16} color="#F44336" />
          </Pressable>
        </View>
      )}
    </View>
  )

  if (carregando) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <View style={{ padding: 16, backgroundColor: '#4CAF50' }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Preparar Offline</Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
          Baixe checklists pra executar sem internet
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 16 }}>
        {/* Card de resumo */}
        <View style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8 }}>
          <Text style={{ fontSize: 12, color: '#666' }}>Espaço Ocupado</Text>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#2e7d32', marginTop: 4 }}>
            {TAMANHO_MB(totalArmazenado)} MB
          </Text>
          <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            {checklists.filter(c => c.status === 'preparado').length} checklist(s) preparado(s)
          </Text>
        </View>

        {/* Lista de preparados */}
        {checklists.length > 0 && (
          <View>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#000', marginBottom: 8 }}>
              Preparados
            </Text>
            <FlatList
              data={checklists}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              scrollEnabled={false}
            />
          </View>
        )}

        {checklists.length === 0 && (
          <View style={{ alignItems: 'center', padding: 32 }}>
            <Download size={40} color="#999" />
            <Text style={{ color: '#999', marginTop: 12, textAlign: 'center' }}>
              Nenhum checklist preparado ainda.{'\n'}Clique abaixo para começar.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Botão flutuante */}
      <View style={{ padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#ddd' }}>
        <Pressable
          onPress={abrirModal}
          style={{
            padding: 16,
            backgroundColor: '#2196F3',
            borderRadius: 8,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <Download size={20} color="white" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Preparar Checklist</Text>
        </Pressable>
      </View>

      {/* Modal com lista de disponíveis */}
      <Modal visible={modalAberta} transparent animationType="slide" onRequestClose={() => setModalAberta(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Header */}
          <View style={{ padding: 16, backgroundColor: '#2196F3', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              Checklists Disponíveis
            </Text>
            <Pressable onPress={() => setModalAberta(false)}>
              <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {/* Lista */}
          {carregandoLista ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          ) : (
            <FlatList
              data={listaDisponivelModal.filter(ckl => !checklists.find(p => p.id === ckl.id))}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => iniciarPreparacao(item.id, item.nome)}
                  style={{
                    padding: 16,
                    borderBottomWidth: 1,
                    borderColor: '#ddd',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>{item.nome}</Text>
                    <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      {item.subgrupo_id ? 'Seu subgrupo' : 'Disponível'}
                    </Text>
                  </View>
                  <Download size={20} color="#2196F3" />
                </Pressable>
              )}
              keyExtractor={item => item.id}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Text style={{ color: '#999' }}>Todos os checklists já estão preparados</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
