// Campo para captura de foto
// Integração com câmera (Expo Camera), compressão

import React, { useRef, useState } from 'react'
import { View, Text, Pressable, Image, ActivityIndicator, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Camera } from 'expo-camera'
import { X } from 'lucide-react-native'
import { comprimirImagem } from '@/lib/midia'

interface CampoFotoProps {
  atividade: { id: string; nome: string; obrigatoria?: boolean }
  resposta?: { url?: string; nome: string; file?: Blob }
  onChange: (valor: any) => void
  maxFotos?: number
}

export function CampoFoto({ atividade, resposta, onChange, maxFotos = 1 }: CampoFotoProps) {
  const [carregando, setCarregando] = useState(false)
  const [permissao, setPermissao] = useState<boolean | null>(null)
  const cameraRef = useRef<Camera>(null)

  // Solicita permissão de câmera
  const solicitarPermissao = async () => {
    const { status } = await Camera.requestCameraPermissions()
    setPermissao(status === 'granted')
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Habilite acesso à câmera nas configurações')
    }
  }

  // Captura foto da câmera
  const capturarFoto = async () => {
    if (!cameraRef.current) return

    try {
      setCarregando(true)
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 })

      // Comprime imagem
      const comprimida = await comprimirImagem(foto.uri)

      onChange({
        url: comprimida.uri,
        nome: `foto-${Date.now()}.jpg`,
        file: comprimida.file
      })
    } catch (error) {
      Alert.alert('Erro', 'Não conseguimos capturar a foto')
      console.error(error)
    } finally {
      setCarregando(false)
    }
  }

  // Abre galeria
  const abrirGaleria = async () => {
    try {
      setCarregando(true)
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8
      })

      if (!resultado.canceled) {
        const asset = resultado.assets[0]
        const comprimida = await comprimirImagem(asset.uri)

        onChange({
          url: comprimida.uri,
          nome: asset.fileName || `foto-${Date.now()}.jpg`,
          file: comprimida.file
        })
      }
    } catch (error) {
      Alert.alert('Erro', 'Não conseguimos acessar a galeria')
      console.error(error)
    } finally {
      setCarregando(false)
    }
  }

  // Se já tem foto, mostra preview
  if (resposta?.url) {
    return (
      <View style={{ marginTop: 8, gap: 8 }}>
        <Image
          source={{ uri: resposta.url }}
          style={{ width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
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
    <View style={{ marginTop: 8, gap: 8 }}>
      {carregando && (
        <View style={{ alignItems: 'center', padding: 16 }}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      )}

      {!carregando && (
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={capturarFoto}
            style={{
              padding: 12,
              backgroundColor: '#4CAF50',
              borderRadius: 4,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>📷 Tirar Foto</Text>
          </Pressable>

          <Pressable
            onPress={abrirGaleria}
            style={{
              padding: 12,
              backgroundColor: '#2196F3',
              borderRadius: 4,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>📁 Galeria</Text>
          </Pressable>

          {permissao === false && (
            <Pressable
              onPress={solicitarPermissao}
              style={{
                padding: 12,
                backgroundColor: '#FF9800',
                borderRadius: 4,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Habilitar Câmera</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}
