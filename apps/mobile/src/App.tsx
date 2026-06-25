// App principal com navegação
// Exemplo de integração completa

import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

// Telas
import { PreparoOfflineScreen } from './screens/PreparoOfflineScreen'
import { ExecucaoChecklistScreen } from './screens/ExecucaoChecklist'
import { HomeScreen } from './screens/HomeScreen' // TODO: criar
import { SincronizacaoScreen } from './screens/SincronizacaoScreen' // TODO: criar

// Storage & Sincronização
import { storage } from './lib/storage'
import { iniciarMonitorConexao, type SincronizacaoStatus } from './lib/sincronizacao'

// Context
import { SessionProvider } from './contexts/SessionContext' // TODO: criar

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// ─── Stack de Preparação ───────────────────────────────────────────

function PreparoStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false
      }}
    >
      <Stack.Screen
        name="PreparoOffline"
        component={PreparoOfflineScreen}
      />
    </Stack.Navigator>
  )
}

// ─── Stack de Execução ────────────────────────────────────────────

function ExecucaoStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ExecucaoChecklist"
        component={ExecucaoChecklistScreen}
        options={{ title: 'Executar Checklist', headerBackTitle: 'Voltar' }}
      />
    </Stack.Navigator>
  )
}

// ─── Tab Navigator ───────────────────────────────────────────────

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home'

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline'
          } else if (route.name === 'Execucoes') {
            iconName = focused ? 'checkbox' : 'checkbox-outline'
          } else if (route.name === 'Preparacao') {
            iconName = focused ? 'download' : 'download-outline'
          } else if (route.name === 'Sincronizacao') {
            iconName = focused ? 'sync' : 'sync-outline'
          }

          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: '#999',
        headerTitleAlign: 'center'
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'CheckFlow Mobile' }}
      />

      <Tab.Screen
        name="Execucoes"
        component={ExecucaoStack}
        options={{ title: 'Executar' }}
      />

      <Tab.Screen
        name="Preparacao"
        component={PreparoStack}
        options={{ title: 'Preparar Offline' }}
      />

      <Tab.Screen
        name="Sincronizacao"
        component={SincronizacaoScreen}
        options={{ title: 'Sincronização' }}
      />
    </Tab.Navigator>
  )
}

// ─── Root App ────────────────────────────────────────────────────

function RootNavigator() {
  const [inicializado, setInicializado] = useState(false)
  const [sincAtiva, setSincAtiva] = useState(false)

  useEffect(() => {
    const inicializar = async () => {
      try {
        // Inicia storage
        await storage.init()

        // Inicia monitor de sincronização
        // NOTA: token precisa vir do contexto de sessão
        // const { token } = useSession()
        // const cleanup = iniciarMonitorConexao(token, (status: SincronizacaoStatus) => {
        //   console.log('✓ Sincronizado:', status)
        //   // Mostrar toast ou notificação
        // })

        setInicializado(true)
      } catch (error) {
        console.error('Erro ao inicializar:', error)
        // Mostrar erro
        setInicializado(true) // Continua mesmo com erro
      }
    }

    inicializar()
  }, [])

  if (!inicializado) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={TabNavigator}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

// ─── App com Context ───────────────────────────────────────────

export default function App() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  )
}
