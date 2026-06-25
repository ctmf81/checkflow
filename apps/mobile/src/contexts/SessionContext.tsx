// Contexto de sessão — usuário, token, unidade ativa

import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { storage } from '@/lib/storage'
import type { AuthToken } from '@/lib/tipos'

export interface SessionUser {
  id: string
  cpf: string
  nome: string
  telefone: string
  empresaId: string
  unidadeId: string
}

export interface SessionContextType {
  user: SessionUser | null
  token: string | null
  unidadeId: string | null
  loading: boolean
  login: (token: string, user: SessionUser) => Promise<void>
  logout: () => Promise<void>
  trocarUnidade: (unidadeId: string) => Promise<void>
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [unidadeId, setUnidadeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Restaura sessão ao iniciar
  useEffect(() => {
    const restaurarSessao = async () => {
      try {
        const tokenSalvo = await AsyncStorage.getItem('auth_token')
        const userSalvo = await AsyncStorage.getItem('auth_user')
        const unidadeSalva = await AsyncStorage.getItem('unidade_ativa')

        if (tokenSalvo && userSalvo) {
          const parsedUser = JSON.parse(userSalvo)
          setToken(tokenSalvo)
          setUser(parsedUser)
          setUnidadeId(unidadeSalva || parsedUser.unidadeId)

          // Salva no SQLite para sincronização
          await storage.salvarAuthToken({
            cpf: parsedUser.cpf,
            telefone: parsedUser.telefone,
            token: tokenSalvo,
            empresaId: parsedUser.empresaId,
            unidadeId: unidadeSalva || parsedUser.unidadeId,
            usuarioId: parsedUser.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
          })
        }
      } catch (error) {
        console.error('Erro ao restaurar sessão:', error)
      } finally {
        setLoading(false)
      }
    }

    restaurarSessao()
  }, [])

  const login = async (newToken: string, newUser: SessionUser) => {
    try {
      setToken(newToken)
      setUser(newUser)
      setUnidadeId(newUser.unidadeId)

      // Persiste em AsyncStorage
      await AsyncStorage.setItem('auth_token', newToken)
      await AsyncStorage.setItem('auth_user', JSON.stringify(newUser))
      await AsyncStorage.setItem('unidade_ativa', newUser.unidadeId)

      // Persiste em SQLite para sincronização
      await storage.salvarAuthToken({
        cpf: newUser.cpf,
        telefone: newUser.telefone,
        token: newToken,
        empresaId: newUser.empresaId,
        unidadeId: newUser.unidadeId,
        usuarioId: newUser.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
    } catch (error) {
      console.error('Erro ao fazer login:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('auth_token')
      await AsyncStorage.removeItem('auth_user')
      await AsyncStorage.removeItem('unidade_ativa')
      setToken(null)
      setUser(null)
      setUnidadeId(null)
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  const trocarUnidade = async (novaUnidadeId: string) => {
    try {
      setUnidadeId(novaUnidadeId)
      await AsyncStorage.setItem('unidade_ativa', novaUnidadeId)
    } catch (error) {
      console.error('Erro ao trocar unidade:', error)
    }
  }

  return (
    <SessionContext.Provider
      value={{
        user,
        token,
        unidadeId,
        loading,
        login,
        logout,
        trocarUnidade
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextType {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession deve ser usado dentro de SessionProvider')
  }
  return context
}
