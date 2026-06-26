'use client'

import { useState, useEffect } from 'react'
import { X, Send, Copy, Check } from 'lucide-react'

interface Usuario {
  id: string
  nome: string
  celular?: string
  email: string
}

interface ShareAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ShareAppModal({ isOpen, onClose }: ShareAppModalProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [copiado, setCopiado] = useState(false)

  const appUrl = 'https://app.checkflow.digital/api/download-app'
  const linkWhatsApp = appUrl

  useEffect(() => {
    if (isOpen) {
      carregarUsuarios()
    }
  }, [isOpen])

  const carregarUsuarios = async () => {
    try {
      const res = await fetch('/api/usuarios', { method: 'GET' })
      const data = await res.json()
      setUsuarios(data || [])
    } catch (e) {
      console.error('Erro ao carregar usuários:', e)
    } finally {
      setCarregando(false)
    }
  }

  const toggleUsuario = (id: string) => {
    const novo = new Set(selecionados)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setSelecionados(novo)
  }

  const toggleTodos = () => {
    if (selecionados.size === usuarios.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(usuarios.map(u => u.id)))
    }
  }

  const enviarWhatsApp = () => {
    const usuariosSelecionados = usuarios.filter(u => selecionados.has(u.id))

    if (usuariosSelecionados.length === 0) {
      alert('Selecione pelo menos um usuário')
      return
    }

    usuariosSelecionados.forEach(usuario => {
      if (usuario.celular) {
        const numero = usuario.celular.replace(/\D/g, '')
        const url = `https://wa.me/55${numero}?text=${encodeURIComponent(
          `Olá ${usuario.nome}!\n\nBaixe o Check Go:\n${appUrl}`
        )}`
        window.open(url, '_blank')
      }
    })
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(linkWhatsApp)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Compartilhar Check Go</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Link para copiar */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Link do App:</p>
            <div className="flex gap-2 min-w-0">
              <input
                type="text"
                value={linkWhatsApp}
                readOnly
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded font-mono"
              />
              <button
                onClick={copiarLink}
                className={`flex-shrink-0 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  copiado
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-300 text-gray-900 hover:bg-gray-400'
                }`}
              >
                {copiado ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Seleção de usuários */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                Selecionar Usuários ({selecionados.size})
              </p>
              <button
                onClick={toggleTodos}
                className="text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                {selecionados.size === usuarios.length ? 'Desselecionar tudo' : 'Selecionar tudo'}
              </button>
            </div>

            {carregando ? (
              <p className="text-sm text-gray-500 text-center py-4">Carregando usuários...</p>
            ) : usuarios.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum usuário encontrado</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {usuarios.map(usuario => (
                  <label
                    key={usuario.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(usuario.id)}
                      onChange={() => toggleUsuario(usuario.id)}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{usuario.nome}</p>
                      <p className="text-xs text-gray-500">{usuario.celular || usuario.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Aviso */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-xs text-blue-900">
              💡 Clique para abrir WhatsApp com cada usuário. Customize a mensagem se quiser!
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-900 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={enviarWhatsApp}
              disabled={selecionados.size === 0}
              className="flex-1 px-4 py-2 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Send size={16} />
              Enviar WhatsApp ({selecionados.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
