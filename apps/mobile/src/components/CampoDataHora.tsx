// Campo de data/hora com picker nativo
// iOS: DatePickerIOS | Android: DateTimePickerAndroid

import React, { useState } from 'react'
import { View, Text, Pressable, Modal, SafeAreaView, Platform } from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Calendar } from 'lucide-react-native'
import type { Atividade } from '@/lib/tipos'

interface CampoDataHoraProps {
  atividade: Atividade
  resposta?: string // ISO 8601
  onChange: (valor: string) => void
}

export function CampoDataHora({ atividade, resposta, onChange }: CampoDataHoraProps) {
  const [mostrarPicker, setMostrarPicker] = useState(false)
  const [modo, setModo] = useState<'date' | 'time'>('date')

  // Se não tem resposta e tem config automático, preenche com agora
  React.useEffect(() => {
    if (!resposta && atividade.config?.automatico) {
      onChange(new Date().toISOString())
    }
  }, [])

  const dataAtual = resposta ? new Date(resposta) : new Date()

  const formatarData = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleMudancaPicker = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setMostrarPicker(false)
    }

    if (event.type === 'set' && date) {
      if (modo === 'date') {
        // Após selecionar data, vai pra hora
        setModo('time')
        if (Platform.OS === 'android') {
          setMostrarPicker(true)
        }
      } else {
        // Após selecionar hora, finaliza
        onChange(date.toISOString())
        setModo('date')
        setMostrarPicker(false)
      }
    } else if (event.type === 'dismissed') {
      setModo('date')
      setMostrarPicker(false)
    }
  }

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <Pressable
        onPress={() => {
          setModo('date')
          setMostrarPicker(true)
        }}
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 4,
          backgroundColor: resposta ? '#f0f0f0' : '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8
        }}
      >
        <Calendar size={20} color={resposta ? '#4CAF50' : '#999'} />
        <Text style={{ color: resposta ? '#000' : '#999', fontSize: 14, flex: 1 }}>
          {resposta ? formatarData(resposta) : 'Selecione data/hora'}
        </Text>
      </Pressable>

      {/* Picker nativo */}
      {mostrarPicker && (
        <>
          {Platform.OS === 'android' ? (
            // Android: DateTimePickerAndroid (não modal)
            <DateTimePicker
              value={dataAtual}
              mode={modo}
              display="default"
              onChange={handleMudancaPicker}
            />
          ) : (
            // iOS: Modal com DatePickerIOS
            <Modal transparent animationType="slide">
              <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View style={{ backgroundColor: '#fff' }}>
                    {/* Header */}
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderColor: '#ddd'
                      }}
                    >
                      <Pressable onPress={() => setMostrarPicker(false)}>
                        <Text style={{ fontSize: 16, color: '#666' }}>Cancelar</Text>
                      </Pressable>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>
                        {modo === 'date' ? 'Selecione a Data' : 'Selecione a Hora'}
                      </Text>
                      <Pressable
                        onPress={() => {
                          if (modo === 'date') {
                            setModo('time')
                          } else {
                            onChange(dataAtual.toISOString())
                            setMostrarPicker(false)
                            setModo('date')
                          }
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#4CAF50', fontWeight: '600' }}>
                          {modo === 'date' ? 'Próximo' : 'Pronto'}
                        </Text>
                      </Pressable>
                    </View>

                    {/* Picker */}
                    <DateTimePicker
                      value={dataAtual}
                      mode={modo}
                      display="spinner"
                      onChange={handleMudancaPicker}
                      textColor="#000"
                    />
                  </View>
                </View>
              </SafeAreaView>
            </Modal>
          )}
        </>
      )}
    </View>
  )
}
