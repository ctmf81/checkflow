# 🚀 Build Production — Check Go APK/IPA

**Objetivo:** Gerar aplicativos prontos para instalar no celular (sem Expo Go)

---

## 📋 Pré-requisitos

1. **EAS CLI instalada:**
   ```bash
   npm install -g eas-cli@latest
   ```

2. **Conta Expo:** https://expo.dev (grátis)

3. **Dentro de `apps/mobile`**

---

## 🔐 Login EAS

```bash
eas login
# Ou
eas login --username seu-usuario
```

---

## 📱 Build Android (APK)

```bash
eas build --platform android --profile production
```

**O que acontece:**
- EAS compila seu código
- Gera `CheckGo.apk`
- Download link aparece no terminal
- Leva ~10-15 min

**Resultado:**
```
✓ Build completo
📥 Download APK aqui: https://...apk
💾 Instale no Android: adb install CheckGo.apk
```

---

## 🍎 Build iOS (IPA)

```bash
eas build --platform ios --profile production
```

**O que acontece:**
- EAS compila seu código
- Gera `CheckGo.ipa`
- Download link aparece
- Leva ~15-20 min
- Precisa de Apple Developer Account para distribuir

**Resultado:**
```
✓ Build completo
📥 Download IPA aqui: https://...ipa
💾 Instale no iOS via TestFlight
```

---

## 🎯 Build Para Ambos (Android + iOS)

```bash
eas build --platform all --profile production
```

Compila os dois em paralelo.

---

## 📥 Como Instalar o APK

### No Android:
```bash
# Se tiver adb instalado
adb install CheckGo.apk

# Ou transfira o arquivo e clique para instalar
```

### No iOS:
```bash
# Via TestFlight (recomendado)
# EAS mostra o link para adicionar à TestFlight

# Ou via Xcode
xcode-select --install
open CheckGo.ipa
```

---

## 🔑 Certificados e Signing

**Android:**
- EAS gera automaticamente (keystore)
- Ou forneça seu próprio em `eas.json`

**iOS:**
- Precisa de Apple Developer Account ($99/ano)
- EAS pode criar certificates automaticamente
- Ou forneça seus próprios

---

## 📊 Status e Histórico

```bash
# Ver builds anteriores
eas build:list

# Ver status de um build
eas build:view <BUILD_ID>

# Logs detalhados
eas build:logs <BUILD_ID>
```

---

## 🐛 Troubleshooting

### Build falhou?
```bash
eas build:logs <BUILD_ID>
# Mostra o erro exato
```

### Certificado expirou (iOS)?
```bash
eas credentials
# Renove os certificados
```

### Versão muito antiga?
```bash
# Atualize a versão em app.json
"version": "0.2.0"

# Ou em package.json
"version": "0.2.0"
```

---

## 📦 Distribuir em Lojas

### Google Play Store:
1. Crie conta Google Play Developer ($25)
2. Upload do APK
3. Preencha dados da app
4. Publicar

### Apple App Store:
1. Apple Developer Account ($99/ano)
2. Upload do IPA via Xcode ou TestFlight
3. Preencha dados da app
4. Apple revisa (24-48h)
5. Publicar

---

## ✅ Checklist Antes de Build

- [ ] Versão atualizada em `app.json`
- [ ] Versão atualizada em `package.json`
- [ ] Icones e splash screens OK (`assets/icon.png`, `assets/splash.png`)
- [ ] Variáveis de ambiente em `.env` (se usar)
- [ ] Testou em Expo Go (`npm start`)
- [ ] EAS Login feito (`eas login`)

---

## 🎬 Exemplo Completo

```bash
cd apps/mobile

# 1. Login
eas login

# 2. Atualizar versão
# Edite app.json: "version": "0.2.0"

# 3. Build Android
eas build --platform android --profile production

# 4. Aguarde ~15 min
# Terminal mostra: https://builds.easbuild.app/builds/...apk

# 5. Download automático ou manual via link

# 6. Instale no celular
adb install CheckGo.apk
```

---

## 🚀 Próximas Vezes

Depois do primeiro build, você pode:

```bash
# Build rápido com cache
eas build --platform android --profile production --clear-cache=false

# Build local (mais rápido, mas precisa de Android SDK)
eas build --platform android --local
```

---

## 📞 Suporte

- EAS Docs: https://docs.expo.dev/eas-update/
- Erro?: Execute `eas build:logs <BUILD_ID>`

---

**Status:** 🟢 Pronto para build production
