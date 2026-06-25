// Campo de padrão (validação complexa por combinação de variáveis)
// Operador seleciona variáveis + digita número → valida contra faixa

import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, Modal, FlatList } from 'react-native'
import { ChevronDown, AlertCircle } from 'lucide-react-native'
import { storage } from '@/lib/storage'
import type { Atividade, PadraoInstancia } from '@/lib/tipos'

interface CampoPadraoProps {
  atividade: Atividade
  resposta?: { numero: number; instancia_id: string; valor_min: number | null; valor_max: number | null }
  onChange: (valor: any) => void
}

export function CampoPadrao({ atividade, resposta, onChange }: CampoPadraoProps) {
  const [instancias, setInstancias] = useState<PadraoInstancia[]>([])
  const [variaveisModal, setVariaveisModal] = useState(false)
  const [selectadas, setSelectadas] = useState<Record<string, string>>({})
  const [instanciaSelecionada, setInstanciaSelecionada] = useState<PadraoInstancia | null>(null)
  const [numero, setNumero] = useState('')
  const [carregando, setCarregando] = useState(true)

  // Carrega instâncias do padrão
  useEffect(() => {
    const carregar = async () => {
      try {
        const padraoId = atividade.config?.padrao_id
        if (!padraoId) return

        const insts = await storage.obterPadraoInstancias(padraoId)
        setInstancias(insts)

        // Se retomando resposta
        if (resposta) {
          setNumero(String(resposta.numero))
          const inst = insts.find(i => i.id === resposta.instancia_id)
          if (inst) {
            setInstanciaSelecionada(inst)
            setSelectadas(inst.valores)
          }
        }
      } catch (error) {
        console.error('Erro ao carregar padrão:', error)
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [atividade])

  // Busca instância pela combinação de variáveis
  const buscarInstancia = (valores: Record<string, string>) => {
    const inst = instancias.find(i => {
      for (const [varId, valor] of Object.entries(valores)) {
        if (i.valores[varId] !== valor) return false
      }
      return true
    })
    return inst || null
  }

  // Seleciona variável
  const selecionarVariavel = (varId: string, valor: string) => {
    const novasSelectadas = { ...selectadas, [varId]: valor }
    setSelectadas(novasSelectadas)

    const inst = buscarInstancia(novasSelectadas)
    setInstanciaSelecionada(inst)
  }

  // Finaliza seleção
  const finalizarSelecao = () => {
    if (!instanciaSelecionada || !numero) {
      return
    }

    onChange({
      numero: Number(numero),
      instancia_id: instanciaSelecionada.id,
      valor_min: instanciaSelecionada.valor_min,
      valor_max: instanciaSelecionada.valor_max
    })

    setVariaveisModal(false)
  }

  // Se já selecionou
  if (resposta && !variaveisModal) {
    return (
      <View style={{ marginTop: 8, gap: 8 }}>
        <View
          style={{
            padding: 12,
            backgroundColor: '#f3e5f5',
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 12, color: '#666' }}>Valor Selecionado</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4CAF50', marginTop: 4 }}>
            {resposta.numero}
          </Text>
          <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            Faixa: {resposta.valor_min ?? '-'} a {resposta.valor_max ?? '-'}
          </Text>
        </View>

        <Pressable
          onPress={() => setVariaveisModal(true)}
          style={{
            padding: 8,
            backgroundColor: '#2196F3',
            borderRadius: 4,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Alterar</Text>
        </Pressable>
      </View>
    )
  }

  // Modal para seleção de variáveis
  return (
    <>
      <Pressable
        onPress={() => setVariaveisModal(true)}
        style={{
          marginTop: 8,
          padding: 12,
          backgroundColor: '#9C27B0',
          borderRadius: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>🔧 Selecionar Padrão</Text>
        <ChevronDown size={20} color="white" />
      </Pressable>

      <Modal
        visible={variaveisModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setVariaveisModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Header */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#9C27B0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              {atividade.nome}
            </Text>
            <Pressable onPress={() => setVariaveisModal(false)}>
              <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }}>
            {carregando ? (
              <Text>Carregando...</Text>
            ) : instancias.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <AlertCircle size={32} color="#F44336" />
                <Text style={{ color: '#F44336', marginTop: 8 }}>Nenhuma instância disponível</Text>
              </View>
            ) : (
              <>
                {/* Variáveis (agrupadas) */}
                {/* TODO: extrair lista única de variáveis e renderizar */}
                <Text style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
                  {Object.keys(selectadas).length} de N variáveis selecionadas
                </Text>

                {/* Campo número */}
                {instanciaSelecionada && (
                  <View style={{ marginTop: 16, gap: 8 }}>
                    <Text style={{ fontSize: 12, color: '#666', fontWeight: '600' }}>
                      Valor Medido
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        placeholder="Digite o valor"
                        placeholderTextColor="#999"
                        value={numero}
                        onChangeText={setNumero}
                        keyboardType="numeric"
                        style={{
                          flex: 1,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: '#ddd',
                          borderRadius: 4,
                          fontSize: 16
                        }}
                      />
                      <Text style={{ fontSize: 14, color: '#999' }}>
                        [{instanciaSelecionada.valor_min ?? '-'}, {instanciaSelecionada.valor_max ?? '-'}]
                      </Text>
                    </View>
                  </View>
                )}

                {!instanciaSelecionada && (
                  <View
                    style={{
                      marginTop: 16,
                      padding: 12,
                      backgroundColor: '#fff3e0',
                      borderRadius: 8,
                      flexDirection: 'row',
                      gap: 8
                    }}
                  >
                    <AlertCircle size={16} color="#FF9800" />
                    <Text style={{ color: '#FF9800', flex: 1, fontSize: 12 }}>
                      Selecione as variáveis para encontrar a faixa esperada
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Botão finalizar */}
          {instanciaSelecionada && (
            <View style={{ padding: 16, borderTopWidth: 1, borderColor: '#ddd' }}>
              <Pressable
                onPress={finalizarSelecao}
                disabled={!numero}
                style={{
                  padding: 12,
                  backgroundColor: numero ? '#4CAF50' : '#ccc',
                  borderRadius: 4,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  )
}
