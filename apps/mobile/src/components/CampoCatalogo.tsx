// Campo de seleção de catálogo
// Busca local em SQLite (offline)

import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, TextInput, FlatList, Image, Modal } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { storage } from '@/lib/storage'
import type { Atividade, CatalogoValor } from '@/lib/tipos'

interface CampoCatalogoProps {
  atividade: Atividade
  resposta?: CatalogoValor | null
  onChange: (valor: CatalogoValor | null) => void
}

export function CampoCatalogo({ atividade, resposta, onChange }: CampoCatalogoProps) {
  const [valores, setValores] = useState<CatalogoValor[]>([])
  const [filtrados, setFiltrados] = useState<CatalogoValor[]>([])
  const [busca, setBusca] = useState('')
  const [modalAberta, setModalAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)

  // Carrega catálogo ao montar
  useEffect(() => {
    const carregar = async () => {
      try {
        const catalogoId = atividade.config?.catalogo_id
        if (!catalogoId) return

        const vals = await storage.obterCatalogosValores(catalogoId)
        setValores(vals)
        setFiltrados(vals)
      } catch (error) {
        console.error('Erro ao carregar catálogo:', error)
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [atividade])

  // Atualiza filtro de busca
  useEffect(() => {
    if (!busca.trim()) {
      setFiltrados(valores)
      return
    }

    const termo = busca.toLowerCase()
    setFiltrados(
      valores.filter(v =>
        v.valor_chave.toLowerCase().includes(termo) ||
        v.atributo_1?.toLowerCase().includes(termo) ||
        v.atributo_2?.toLowerCase().includes(termo) ||
        v.atributo_3?.toLowerCase().includes(termo) ||
        v.atributo_4?.toLowerCase().includes(termo)
      )
    )
  }, [busca, valores])

  // Renderiza item de catálogo
  const renderItem = ({ item }: { item: CatalogoValor }) => (
    <Pressable
      onPress={() => {
        onChange(item)
        setModalAberta(false)
        setBusca('')
      }}
      style={{
        padding: 12,
        marginBottom: 8,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center'
      }}
    >
      {/* Imagem */}
      {item.imagem_url && (
        <Image
          source={{ uri: item.imagem_url }}
          style={{ width: 60, height: 60, borderRadius: 4, backgroundColor: '#f0f0f0' }}
        />
      )}

      {/* Informações */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#000' }}>
          {item.valor_chave}
        </Text>
        {item.atributo_1 && <Text style={{ fontSize: 12, color: '#666' }}>{item.atributo_1}</Text>}
        {item.atributo_2 && <Text style={{ fontSize: 12, color: '#666' }}>{item.atributo_2}</Text>}
      </View>
    </Pressable>
  )

  // Se já selecionou
  if (resposta && !modalAberta) {
    return (
      <View style={{ marginTop: 8, gap: 8 }}>
        <View
          style={{
            padding: 12,
            backgroundColor: '#e3f2fd',
            borderRadius: 8,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center'
          }}
        >
          {resposta.imagem_url && (
            <Image
              source={{ uri: resposta.imagem_url }}
              style={{ width: 50, height: 50, borderRadius: 4 }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Selecionado</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1976d2' }}>
              {resposta.valor_chave}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setModalAberta(true)}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#2196F3',
              borderRadius: 4,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Alterar</Text>
          </Pressable>

          <Pressable
            onPress={() => onChange(null)}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#f44336',
              borderRadius: 4,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Remover</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <>
      {/* Botão abrir modal */}
      {!modalAberta && (
        <Pressable
          onPress={() => setModalAberta(true)}
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: '#9C27B0',
            borderRadius: 4,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>🔍 Buscar no Catálogo</Text>
        </Pressable>
      )}

      {/* Modal com busca */}
      <Modal
        visible={modalAberta}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalAberta(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Header */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#9C27B0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 }}>
              {atividade.nome}
            </Text>
            <Pressable onPress={() => setModalAberta(false)}>
              <X size={24} color="white" />
            </Pressable>
          </View>

          {/* Busca */}
          <View style={{ padding: 12, gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f0f0f0',
                borderRadius: 8,
                paddingHorizontal: 12
              }}
            >
              <Search size={20} color="#999" />
              <TextInput
                placeholder="Buscar por nome ou atributo..."
                placeholderTextColor="#999"
                value={busca}
                onChangeText={setBusca}
                style={{
                  flex: 1,
                  padding: 12,
                  fontSize: 14,
                  color: '#000'
                }}
              />
              {busca && (
                <Pressable onPress={() => setBusca('')}>
                  <X size={20} color="#999" />
                </Pressable>
              )}
            </View>
            <Text style={{ fontSize: 12, color: '#999' }}>
              {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Lista */}
          <FlatList
            data={filtrados}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 12 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Text style={{ color: '#999' }}>
                  {carregando ? 'Carregando...' : 'Nenhum resultado encontrado'}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  )
}
