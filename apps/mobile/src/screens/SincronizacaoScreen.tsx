// Tela de Sincronização — Status, logs, retry manual

import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, SafeAreaView, ActivityIndicator, Alert } from 'react-native'
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react-native'
import { storage } from '@/lib/storage'
import { sincronizar, temInternet, type SincronizacaoStatus } from '@/lib/sincronizacao'
import { useSession } from '@/contexts/SessionContext'

export function SincronizacaoScreen() {
  const { token } = useSession()
  const [execPendentes, setExecPendentes] = useState(0)
  const [planosPendentes, setPlanosPendentes] = useState(0)
  const [internet, setInternet] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimoStatus, setUltimoStatus] = useState<SincronizacaoStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  // Verifica status inicial
  useEffect(() => {
    const verificar = async () => {
      const execs = await storage.listarExecucoesPendentes()
      setExecPendentes(execs.length)

      const planos = await storage.listarPlanosPendentes()
      setPlanosPendentes(planos.length)

      const temNet = await temInternet()
      setInternet(temNet)

      if (temNet) {
        adicionarLog('✓ Conectado à internet')
      } else {
        adicionarLog('✗ Sem conexão com internet')
      }
    }

    verificar()

    // Verifica conexão a cada 10s
    const interval = setInterval(verificar, 10000)
    return () => clearInterval(interval)
  }, [])

  const adicionarLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 19)])
  }

  const sincronizarAgora = async () => {
    if (!token) {
      Alert.alert('Erro', 'Token de autenticação não encontrado')
      return
    }

    try {
      setSincronizando(true)
      adicionarLog('Iniciando sincronização...')

      const status = await sincronizar(token)
      setUltimoStatus(status)

      if (status.sucesso) {
        adicionarLog(`✓ Sincronizadas ${status.execucoesEnviadas} execuções`)
        adicionarLog(`✓ Sincronizados ${status.planosEnviados} planos`)

        // Atualiza contador
        const execs = await storage.listarExecucoesPendentes()
        setExecPendentes(execs.length)

        const planos = await storage.listarPlanosPendentes()
        setPlanosPendentes(planos.length)

        Alert.alert('Sucesso', `${status.execucoesEnviadas} execuções sincronizadas!`)
      } else {
        adicionarLog('✗ Erro na sincronização')
        status.erros.forEach(e => {
          adicionarLog(`  → ${e.tipo}: ${e.mensagem}`)
        })
      }
    } catch (error: any) {
      adicionarLog(`✗ ${error.message}`)
      Alert.alert('Erro', error.message)
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Status Geral */}
        <View
          style={{
            padding: 16,
            backgroundColor: '#fff',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: internet ? '#4CAF50' : '#F44336'
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {internet ? (
              <CheckCircle2 size={24} color="#4CAF50" />
            ) : (
              <AlertCircle size={24} color="#F44336" />
            )}
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: internet ? '#4CAF50' : '#F44336' }}>
              {internet ? 'Online' : 'Offline'}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#666' }}>Execuções pendentes:</Text>
              <Text style={{ fontWeight: '600', color: '#000' }}>{execPendentes}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#666' }}>Planos rascunho:</Text>
              <Text style={{ fontWeight: '600', color: '#000' }}>{planosPendentes}</Text>
            </View>
          </View>
        </View>

        {/* Botão Sincronizar */}
        {internet && execPendentes + planosPendentes > 0 && (
          <Pressable
            onPress={sincronizarAgora}
            disabled={sincronizando}
            style={{
              padding: 16,
              backgroundColor: sincronizando ? '#ccc' : '#4CAF50',
              borderRadius: 8,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {sincronizando ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text style={{ color: '#fff', fontWeight: '600' }}>Sincronizando...</Text>
              </>
            ) : (
              <>
                <RefreshCw size={20} color="white" />
                <Text style={{ color: '#fff', fontWeight: '600' }}>Sincronizar Agora</Text>
              </>
            )}
          </Pressable>
        )}

        {!internet && execPendentes + planosPendentes > 0 && (
          <View
            style={{
              padding: 12,
              backgroundColor: '#fff3e0',
              borderRadius: 8,
              flexDirection: 'row',
              gap: 8
            }}
          >
            <Clock size={20} color="#FF9800" />
            <Text style={{ color: '#F57C00', flex: 1, fontSize: 12 }}>
              Você está offline. Quando conectar à internet, a sincronização ocorrerá automaticamente.
            </Text>
          </View>
        )}

        {/* Último Status */}
        {ultimoStatus && (
          <View
            style={{
              padding: 12,
              backgroundColor: ultimoStatus.sucesso ? '#e8f5e9' : '#ffebee',
              borderRadius: 8,
              borderLeftWidth: 4,
              borderLeftColor: ultimoStatus.sucesso ? '#4CAF50' : '#F44336'
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: ultimoStatus.sucesso ? '#2e7d32' : '#c62828' }}>
              {ultimoStatus.sucesso ? '✓ Última sincronização bem-sucedida' : '✗ Última sincronização falhou'}
            </Text>
            <Text style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              {ultimoStatus.timestamp}
            </Text>
          </View>
        )}

        {/* Logs */}
        <View>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#000', marginBottom: 8 }}>
            Histórico
          </Text>
          <View
            style={{
              padding: 12,
              backgroundColor: '#fff',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#ddd'
            }}
          >
            {logs.length === 0 ? (
              <Text style={{ color: '#999', fontSize: 12 }}>Nenhum log disponível</Text>
            ) : (
              logs.map((log, i) => (
                <Text key={i} style={{ fontSize: 11, color: '#666', marginBottom: 4, fontFamily: 'monospace' }}>
                  {log}
                </Text>
              ))
            )}
          </View>
        </View>

        {/* Dicas */}
        <View
          style={{
            padding: 12,
            backgroundColor: '#e3f2fd',
            borderRadius: 8
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#1976d2' }}>💡 Dicas</Text>
          <Text style={{ fontSize: 11, color: '#1565c0', marginTop: 6 }}>
            • A sincronização ocorre automaticamente quando você volta online{'\n'}
            • Verifique se o app tem permissão para acessar a internet{'\n'}
            • Se algo falhar, tente novamente manualmente aqui
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
