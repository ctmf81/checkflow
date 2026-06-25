// Campo de localização via GPS
// Sem input manual (só captura automática)

import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native'
import * as Location from 'expo-location'
import { MapPin, RefreshCw, X } from 'lucide-react-native'

interface CampoLocalizacaoProps {
  atividade: { id: string; nome: string; config?: { raio_metros?: number } }
  resposta?: { lat: number; lng: number; endereco?: string }
  onChange: (valor: any) => void
}

export function CampoLocalizacao({ atividade, resposta, onChange }: CampoLocalizacaoProps) {
  const [carregando, setCarregando] = useState(false)
  const [permissao, setPermissao] = useState<boolean | null>(null)

  // Solicita permissão na montagem
  useEffect(() => {
    solicitarPermissao()
  }, [])

  const solicitarPermissao = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    setPermissao(status === 'granted')
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Habilite acesso à localização nas configurações')
    }
  }

  // Captura GPS
  const capturarGPS = async () => {
    if (!permissao) {
      Alert.alert('Permissão necessária', 'Habilite acesso à localização')
      return
    }

    try {
      setCarregando(true)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000
      })

      const { latitude, longitude } = location.coords

      // Reverse geocoding (opcional — descomentar se tiver setup)
      // const [endereco] = await Location.reverseGeocodeAsync({ latitude, longitude })

      onChange({
        lat: latitude,
        lng: longitude,
        endereco: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      })

      Alert.alert('Localização', `Capturado:\n${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
    } catch (error: any) {
      if (error.code === 'PERMISSION_DENIED') {
        Alert.alert('Permissão', 'Localização negada pelo usuário')
      } else if (error.code === 'POSITION_UNAVAILABLE') {
        Alert.alert('GPS', 'Localização não disponível. Tente em lugar aberto.')
      } else if (error.code === 'TIMEOUT') {
        Alert.alert('Timeout', 'Demorou muito para capturar GPS. Tente novamente.')
      } else {
        Alert.alert('Erro', error.message || 'Erro ao capturar GPS')
      }
      console.error(error)
    } finally {
      setCarregando(false)
    }
  }

  // Se já capturou
  if (resposta) {
    return (
      <View style={{ marginTop: 8, gap: 8 }}>
        <View
          style={{
            padding: 12,
            backgroundColor: '#e8f5e9',
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8
          }}
        >
          <MapPin size={20} color="#4CAF50" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Localização</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2e7d32' }}>
              {resposta.endereco}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={capturarGPS}
            disabled={carregando}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#2196F3',
              borderRadius: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4
            }}
          >
            <RefreshCw size={16} color="white" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>Atualizar</Text>
          </Pressable>

          <Pressable
            onPress={() => onChange(null)}
            style={{
              flex: 1,
              padding: 8,
              backgroundColor: '#f44336',
              borderRadius: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4
            }}
          >
            <X size={16} color="white" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>Remover</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Pressable
      onPress={capturarGPS}
      disabled={carregando || !permissao}
      style={{
        marginTop: 8,
        padding: 12,
        backgroundColor: carregando ? '#ccc' : '#4CAF50',
        borderRadius: 4,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8
      }}
    >
      {carregando ? (
        <>
          <ActivityIndicator size="small" color="white" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>Capturando...</Text>
        </>
      ) : permissao === false ? (
        <>
          <MapPin size={16} color="white" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>Habilitar Localização</Text>
        </>
      ) : (
        <>
          <MapPin size={16} color="white" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>📍 Capturar GPS</Text>
        </>
      )}
    </Pressable>
  )
}
