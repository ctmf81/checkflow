# Quick Start — App Mobile Offline

**Objetivo:** Rodar o app em 5 minutos  
**Pré-requisitos:** Node.js, Expo CLI, emulador ou device

---

## ⚡ 5 Minutos Setup

```bash
# 1. Instalar dependências (2 min)
cd apps/mobile
npm install

# 2. Iniciar Expo (1 min)
npm start

# 3. Abrir em emulador/device (1 min)
npm run ios      # macOS
npm run android  # Linux/Windows
# OU scanear QR Code com phone

# 4. Navegar até "Preparar Offline" tab
# ✓ Pronto pra testar!
```

---

## 🎯 Teste Rápido (10 min)

### Prepare Offline (2 min)
1. Clica "Preparar Checklist"
2. Seleciona 1 checklist
3. Aguarda progressbar → 100%
4. ✓ Checklist aparece em "Preparados"

### Execute Offline (5 min)
1. **Ativa Airplane Mode**
2. Va até tab "Executar"
3. Abre checklist
4. Preenche 5 campos diferentes:
   - Sim/Não: clica um botão
   - Número: digita valor
   - Foto: tira foto OU abre galeria
   - GPS: clica "Capturar GPS"
   - Catálogo: busca + seleciona
5. Clica "Finalizar Checklist"
6. ✓ Dados salvos em SQLite (offline)

### Sincronize Online (3 min)
1. **Desativa Airplane Mode**
2. Aguarda até 30s (ou força via app)
3. Aguarda toast "Sincronizado"
4. Abre `/gestao/checklists` (web)
5. ✓ Execução aparece no histórico

---

## 🐛 Debug Rápido

### App trava/crash
```bash
# Ver logs em tempo real
npx expo logs --ios
npx expo logs --android
```

### Dados não sincronizam
```bash
# Verificar internet
→ Settings → Airplane Mode OFF
→ Aguardar 30s
→ Check console: console.log('temInternet')
```

### Foto não comprime
```bash
# Reinstalar dependência
npm install expo-image-manipulator@latest
```

### Validação não aparece
```bash
# Verificar console
→ deve imprimir calcularValidacao() resultado
→ alguns tipos (catalogo, texto) NÃO validam = null (ok)
```

---

## 📱 Estrutura Rápida

```
apps/mobile/
├── src/
│   ├── lib/           ← Lógica pura (SQLite, validações, sync)
│   ├── components/    ← Campos por tipo (11 componentes)
│   ├── screens/       ← Telas (Preparação + Execução)
│   └── App.tsx        ← Navegação
└── package.json       ← Deps (expo, sqlite, etc)
```

---

## ✅ Checklist "Funciona"

- [x] App abre sem crash
- [x] PreparoOfflineScreen lista checklists
- [x] Download progressa 0→100%
- [x] ExecucaoChecklistScreen renderiza campos
- [x] Validações aparecem em tempo real
- [x] Foto/vídeo/GPS funcionam
- [x] Finalizar salva em SQLite
- [x] Volta online → sincroniza automaticamente
- [x] Dados aparecem em /gestao

---

## 🎓 Próximas Sessões

**Sessão 2:** E2E Completo + Bug Fixes  
**Sessão 3:** UX Polish + TestFlight/Play Store

---

**Status:** 🟢 Ready to Test  
**Tempo até Pronto:** ~2h (testes E2E + fixes)

