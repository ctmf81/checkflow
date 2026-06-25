// Home — Dashboard inicial

import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, SafeAreaView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Download, CheckCircle2, AlertCircle } from 'lucide-react-native'
import { storage } from '@/lib/storage'
import { useSession } from '@/contexts/SessionContext'

export function HomeScreen() {
  const navigation = useNavigation()
  const { user } = useSession()
  const [execPendentes, setExecPendentes] = useState(0)
  const [planosRascunho, setRascunho] = useState(0)
  const [checklistsPreparados, setPreparados] = useState(0)

  useEffect(() => {
    const carregar = async () => {
      try {
        const execs = await storage.listarExecucoesPendentes()
        setExecPendentes(execs.length)

        const planos = await storage.listarPlanosPendentes()
        setRascunho(planos.length)

        // TODO: contar checklists preparados
        setPreparados(0)
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      }
    }

    carregar()
  }, [])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Header */}
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#000' }}>
            Olá, {user?.nome?.split(' ')[0] || 'Operador'}
          </Text>
          <Text style={{ fontSize: 14, color: '#999', marginTop: 4 }}>
            Offline-Ready Mode
          </Text>
        </View>

        {/* Status Cards */}
        <View style={{ gap: 12 }}>
          {/* Execuções Pendentes */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#fff3e0',
              borderRadius: 8,
              borderLeftWidth: 4,
              borderLeftColor: '#FF9800'
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={24} color="#FF9800" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Pendentes de Sincronizar</Text>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#FF9800', marginTop: 4 }}>
                  {execPendentes} execução{execPendentes !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            {execPendentes > 0 && (
              <Text style={{ fontSize: 11, color: '#F57C00', marginTop: 8 }}>
                ⚡ Quando voltar online, sincronizarão automaticamente
              </Text>
            )}
          </View>

          {/* Planos de Ação Rascunho */}
          {planosRascunho > 0 && (
            <View
              style={{
                padding: 16,
                backgroundColor: '#f3e5f5',
                borderRadius: 8,
                borderLeftWidth: 4,
                borderLeftColor: '#9C27B0'
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={24} color="#9C27B0" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>Planos Rascunho</Text>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#9C27B0', marginTop: 4 }}>
                    {planosRascunho}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Checklists Preparados */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#e8f5e9',
              borderRadius: 8,
              borderLeftWidth: 4,
              borderLeftColor: '#4CAF50'
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={24} color="#4CAF50" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Prontos para Campo</Text>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#4CAF50', marginTop: 4 }}>
                  {checklistsPreparados}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#2e7d32', marginTop: 8 }}>
              ✓ Preparados para executar offline
            </Text>
          </View>
        </View>

        {/* Ações Rápidas */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#000', marginBottom: 12 }}>
            Ações Rápidas
          </Text>

          <Pressable
            onPress={() => navigation.navigate('Preparacao')}
            style={{
              padding: 16,
              backgroundColor: '#2196F3',
              borderRadius: 8,
              alignItems: 'center',
              flexDirection: 'row',
              gap: 8
            }}
          >
            <Download size={20} color="white" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Preparar Checklist</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Execucoes')}
            style={{
              marginTop: 8,
              padding: 16,
              backgroundColor: '#4CAF50',
              borderRadius: 8,
              alignItems: 'center',
              flexDirection: 'row',
              gap: 8
            }}
          >
            <CheckCircle2 size={20} color="white" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Executar Checklist</Text>
          </Pressable>
        </View>

        {/* Tips */}
        <View
          style={{
            marginTop: 24,
            padding: 12,
            backgroundColor: '#e3f2fd',
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#1976d2' }}>💡 Dica</Text>
          <Text style={{ fontSize: 12, color: '#1565c0', marginTop: 6 }}>
            Prepare checklists antes de sair para o campo. Você poderá executar mesmo sem internet!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
