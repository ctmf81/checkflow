// Campo para gravação de vídeo
// Limite 10 segundos, com contador visual

import React, { useRef, useState } from 'react'
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native'
import { Camera } from 'expo-camera'
import { Play, Square, Trash2 } from 'lucide-react-native'
import * as MediaLibrary from 'expo-media-library'
import { validarDuracaoVideo } from '@/lib/midia'

const MAX_VIDEO_SEG = 10

interface CampoVideoProps {
  atividade: { id: string; nome: string }
  resposta?: { url?: string; nome: string; file?: Blob; origem?: 'camera' | 'galeria' }
  onChange: (valor: any) => void
}

export function CampoVideo({ atividade, resposta, onChange }: CampoVideoProps) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const cameraRef = useRef<Camera>(null)
  const intervaloRef = useRef<NodeJS.Timeout | null>(null)

  // Inicia gravação
  const iniciarGravacao = async () => {
    if (!cameraRef.current) return

    try {
      setGravando(true)
      setSegundos(0)

      // Contador visual (10s limite)
      intervaloRef.current = setInterval(() => {
        setSegundos(s => {
          if (s >= MAX_VIDEO_SEG) {
            pararGravacao()
            return MAX_VIDEO_SEG
          }
          return s + 1
        })
      }, 1000)

      await cameraRef.current.recordAsync({
        quality: Camera.Constants.VideoQuality['720'],
        maxDuration: MAX_VIDEO_SEG,
        mute: false // som ativado
      })
    } catch (error) {
      Alert.alert('Erro', 'Não conseguimos gravar o vídeo')
      console.error(error)
      setGravando(false)
    }
  }

  // Para gravação
  const pararGravacao = async () => {
    if (intervaloRef.current) clearInterval(intervaloRef.current)
    if (!cameraRef.current) return

    try {
      setCarregando(true)
      const video = await cameraRef.current.stopRecording()

      // Valida duração
      const { valido, duracao } = await validarDuracaoVideo(video.uri)
      if (!valido) {
        Alert.alert('Vídeo longo demais', `Máximo ${MAX_VIDEO_SEG}s (você gravou ${duracao.toFixed(1)}s)`)
        return
      }

      // Salva na galeria e retorna
      const media = await MediaLibrary.saveToLibraryAsync(video.uri)

      onChange({
        url: video.uri,
        nome: `video-${Date.now()}.mp4`,
        file: video.uri, // file será o path local
        origem: 'camera'
      })

      setGravando(false)
      setSegundos(0)
    } catch (error) {
      Alert.alert('Erro', 'Não conseguimos processar o vídeo')
      console.error(error)
    } finally {
      setCarregando(false)
    }
  }

  // Se já tem vídeo
  if (resposta?.url) {
    return (
      <View style={{ marginTop: 8, gap: 8 }}>
        <View
          style={{
            width: '100%',
            height: 200,
            backgroundColor: '#000',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Play size={48} color="white" fill="white" />
          <Text style={{ color: '#fff', marginTop: 8, fontSize: 12 }}>
            {resposta.nome}
          </Text>
        </View>

        <Pressable
          onPress={() => onChange(null)}
          style={{
            padding: 8,
            backgroundColor: '#f44336',
            borderRadius: 4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4
          }}
        >
          <Trash2 size={16} color="white" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>Remover</Text>
        </Pressable>
      </View>
    )
  }

  // Tela de gravação
  if (gravando) {
    return (
      <View style={{ marginTop: 8, alignItems: 'center', gap: 16 }}>
        {/* Contador */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: '#f44336',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>
            {segundos}
          </Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>/ {MAX_VIDEO_SEG}s</Text>
        </View>

        {/* Barra de progresso */}
        <View style={{ width: '100%', height: 4, backgroundColor: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              backgroundColor: '#4CAF50',
              width: `${(segundos / MAX_VIDEO_SEG) * 100}%`
            }}
          />
        </View>

        {/* Botão parar */}
        <Pressable
          onPress={pararGravacao}
          disabled={carregando}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: '#f44336',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {carregando ? (
            <ActivityIndicator size="large" color="white" />
          ) : (
            <Square size={32} color="white" fill="white" />
          )}
        </Pressable>
      </View>
    )
  }

  // Botão inicial
  return (
    <Pressable
      onPress={iniciarGravacao}
      style={{
        marginTop: 8,
        padding: 12,
        backgroundColor: '#f44336',
        borderRadius: 4,
        alignItems: 'center'
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '600' }}>🎥 Gravar Vídeo (máx {MAX_VIDEO_SEG}s)</Text>
    </Pressable>
  )
}
