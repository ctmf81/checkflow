// Factory: retorna componente correto baseado no tipo de atividade
// Centraliza toda a lógica de renderização por tipo

import React from 'react'
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native'
import type { Atividade } from '@/lib/tipos'

import { CampoFoto } from './CampoFoto'
import { CampoVideo } from './CampoVideo'
import { CampoLocalizacao } from './CampoLocalizacao'
import { CampoCatalogo } from './CampoCatalogo'
import { CampoPadrao } from './CampoPadrao'

interface CampoGenericoProps {
  atividade: Atividade
  resposta: any
  onChange: (valor: any) => void
}

/**
 * Factory que retorna o componente certo por tipo de atividade
 */
export function CampoFactory({ atividade, resposta, onChange }: CampoGenericoProps) {
  switch (atividade.tipo) {
    case 'sim_nao':
      return <CampoSimNao atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'numero':
      return <CampoNumero atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'texto':
      return <CampoTexto atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'multipla_escolha':
      return <CampoMultiplaEscolha atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'catalogo':
      return <CampoCatalogo atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'foto':
      return <CampoFoto atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'video':
      return <CampoVideo atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'localizacao':
      return <CampoLocalizacao atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'data_hora':
      return <CampoDataHora atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'padrao':
      return <CampoPadrao atividade={atividade} resposta={resposta} onChange={onChange} />

    case 'assinatura':
      return <CampoAssinatura atividade={atividade} resposta={resposta} onChange={onChange} />

    default:
      return (
        <View style={{ padding: 12, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
          <Text style={{ color: '#666' }}>Tipo não suportado: {atividade.tipo}</Text>
        </View>
      )
  }
}

// ─── COMPONENTES SIMPLES (inline) ───────────────────────────────────

function CampoSimNao({ atividade, resposta, onChange }: CampoGenericoProps) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      {['sim', 'nao'].map(opt => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 4,
            backgroundColor: resposta === opt ? '#4CAF50' : '#eee',
            alignItems: 'center'
          }}
        >
          <Text style={{ color: resposta === opt ? '#fff' : '#000', fontWeight: '600' }}>
            {opt === 'sim' ? 'Sim' : 'Não'}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function CampoNumero({ atividade, resposta, onChange }: CampoGenericoProps) {
  const cfg = atividade.config ?? {}
  const min = cfg.min
  const max = cfg.max
  const unidade = cfg.unidade || ''

  return (
    <View style={{ marginTop: 8, gap: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 4,
          paddingHorizontal: 8
        }}
      >
        <TextInput
          placeholder="Digite o valor"
          placeholderTextColor="#999"
          value={resposta ?? ''}
          onChangeText={onChange}
          keyboardType="numeric"
          style={{
            flex: 1,
            padding: 12,
            fontSize: 16
          }}
        />
        {unidade && <Text style={{ color: '#999', paddingRight: 8 }}>{unidade}</Text>}
      </View>
      <Text style={{ fontSize: 11, color: '#999' }}>
        {min !== undefined ? `Mín: ${min}` : ''} {max !== undefined ? `Máx: ${max}` : ''}
      </Text>
    </View>
  )
}

function CampoTexto({ atividade, resposta, onChange }: CampoGenericoProps) {
  const cfg = atividade.config ?? {}
  const mascara = cfg.mascara || ''

  return (
    <TextInput
      placeholder={mascara ? `Formato: ${mascara}` : 'Digite o valor'}
      placeholderTextColor="#999"
      value={resposta ?? ''}
      onChangeText={onChange}
      style={{
        marginTop: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        fontSize: 16,
        color: '#000'
      }}
    />
  )
}

function CampoMultiplaEscolha({ atividade, resposta, onChange }: CampoGenericoProps) {
  const opcoes = atividade.opcoesMC ?? []
  const selecionados = Array.isArray(resposta) ? resposta : resposta ? [resposta] : []

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      {opcoes.map(op => (
        <Pressable
          key={op.id}
          onPress={() => {
            const novo = selecionados.includes(op.valor)
              ? selecionados.filter(v => v !== op.valor)
              : [...selecionados, op.valor]
            onChange(novo)
          }}
          style={{
            padding: 12,
            borderRadius: 4,
            backgroundColor: selecionados.includes(op.valor) ? '#4CAF50' : '#fff',
            borderWidth: 1,
            borderColor: selecionados.includes(op.valor) ? '#4CAF50' : '#ddd',
            borderLeftWidth: 3,
            borderLeftColor: op.e_valido ? '#4CAF50' : '#F44336'
          }}
        >
          <Text
            style={{
              color: selecionados.includes(op.valor) ? '#fff' : '#000',
              fontWeight: selecionados.includes(op.valor) ? '600' : '400'
            }}
          >
            {op.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function CampoDataHora({ atividade, resposta, onChange }: CampoGenericoProps) {
  const [mostrarPicker, setMostrarPicker] = React.useState(false)

  // Pré-preenche com hora atual se tiver flag automático
  React.useEffect(() => {
    if (!resposta && atividade.config?.automatico) {
      onChange(new Date().toISOString())
    }
  }, [])

  const formatarData = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleString('pt-BR')
  }

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <Pressable
        onPress={() => setMostrarPicker(!mostrarPicker)}
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 4,
          backgroundColor: resposta ? '#f0f0f0' : '#fff'
        }}
      >
        <Text style={{ color: resposta ? '#000' : '#999', fontSize: 14 }}>
          {resposta ? formatarData(resposta) : 'Selecione data/hora'}
        </Text>
      </Pressable>

      {/* TODO: integrar react-native-date-picker ou modal nativa */}
      {mostrarPicker && (
        <View style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
          <Text style={{ color: '#999', fontSize: 12 }}>
            (Picker nativo aqui — usar DatePickerIOS no iOS, DateTimePickerAndroid no Android)
          </Text>
        </View>
      )}
    </View>
  )
}

function CampoAssinatura({ atividade, resposta, onChange }: CampoGenericoProps) {
  return (
    <View style={{ marginTop: 8, padding: 12, backgroundColor: '#e8f5e9', borderRadius: 4 }}>
      <Text style={{ color: '#4CAF50', fontWeight: '600' }}>✓ Assinatura</Text>
      <Text style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
        (Captura de assinatura — reservado para app nativo futuro)
      </Text>
    </View>
  )
}

// ─── EXPORT ────────────────────────────────────────────────────────

export const CAMPO_COMPONENTS = {
  sim_nao: CampoSimNao,
  numero: CampoNumero,
  texto: CampoTexto,
  multipla_escolha: CampoMultiplaEscolha,
  catalogo: CampoCatalogo,
  foto: CampoFoto,
  video: CampoVideo,
  assinatura: CampoAssinatura,
  data_hora: CampoDataHora,
  localizacao: CampoLocalizacao,
  padrao: CampoPadrao
}
