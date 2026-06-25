# 📱 Guia: Download do App Mobile via QR Code

**Data:** 2026-06-25  
**Status:** ✅ **Implementado e Commitado**

---

## 🎯 O Que Funciona

Usuários logados na plataforma web podem **baixar o app mobile diretamente** clicando em um botão na aplicação.

### Local do Botão
Na interface web:
1. Clique no ícone/nome do **usuário** (canto superior direito)
2. Dropdown abre
3. Aparece botão **"Baixar App Mobile"** (com ícone de smartphone)

---

## 📋 Fluxo Completo

```
Usuário na web
    ↓
Clica dropdown do usuário (canto superior direito)
    ↓
Vê opção "Baixar App Mobile"
    ↓
Clica
    ↓
Modal abre com:
  - QR Code grande e legível
  - 4 passos de instrução
  - Link direto (copia para compartilhar)
  - Botão "Abrir Expo Go"
    ↓
Usuário escaneia QR com câmera ou clica em "Abrir Expo Go"
    ↓
App abre no celular em segundos
```

---

## 🔧 Componentes

### `DownloadAppModal.tsx` (novo)
- **Prop:** `isOpen` (boolean), `onClose` (função)
- **Renderiza:**
  - QR code com Expo URL (`exp://checkflowmobile.expo.dev`)
  - Instruções passo-a-passo
  - Link copiável
  - Botão externo para "Expo Go" na App Store
  - Campo de aviso sobre funcionalidade offline

### `Header.tsx` (modificado)
- Importa `DownloadAppModal` e ícone `Smartphone`
- Adiciona estado `downloadModalOpen`
- Botão no dropdown: "Baixar App Mobile"
- Passa props ao modal

### `package.json` (modificado)
- Adiciona `qrcode.react` (biblioteca para gerar QR codes)

---

## 🎨 UI/UX

**Modal:**
- Fundo semi-transparente (backdrop)
- Caixa branca com 2xl de largura máxima
- Header com ícone, título e botão X
- QR code no centro com borda e padding
- Instruções em 4 passos numerados
- Link direto em caixa cinza com botão "Copiar"
- Aviso azul sobre funcionalidade offline
- Footer com "Fechar" e "Abrir Expo Go"

**Cores:**
- Orange (CheckFlow primary): botões, ícones, destaque
- Gray: textos, divisórias, fundos secundários
- Azul: aviso informativo

---

## 📱 O QR Code Aponta Para

```
exp://checkflowmobile.expo.dev
```

Isso é:
- **Expo Deep Link** — funciona com app Expo Go instalado
- **Ou** — usuário clica botão "Expo Go" para instalar primeiro

---

## 🚀 Como Funciona (User Flow)

### Opção A: Escanear com câmera
1. Abre câmera do celular
2. Aponta para QR
3. Aparece notificação "Abrir Expo Go"
4. Clica
5. App abre em 2-3s

### Opção B: Clicar botão "Expo Go"
1. Clica botão "Abrir Expo Go" no modal
2. Abre App Store / Google Play
3. Instala Expo Go (se não tiver)
4. Volta ao QR e escaneia

### Opção C: Link direto
1. Copia link da caixa de texto
2. Envia via WhatsApp/email/etc
3. Colega clica link
4. Abre Expo Go e app automaticamente

---

## ⚙️ Instalação

```bash
cd apps/web
npm install qrcode.react
```

✅ Já feito no commit.

---

## 🧪 Teste Rápido

1. **Dev mode:** `npm run dev` em `apps/web`
2. Acesse `http://localhost:3000/gestao` (ou operacao)
3. Clique no usuário (canto superior direito)
4. Veja dropdown com "Baixar App Mobile"
5. Clique nele
6. Modal abre
7. Feche com X ou botão "Fechar"

**Esperado:**
- ✓ Modal centra na tela
- ✓ QR code renderiza (imagem 256x256)
- ✓ Botão "Copiar" funciona (mudança de cor)
- ✓ Link "Expo Go" abre em nova aba

---

## 🎯 Próximos Passos (Opcional)

### Antes de Production:
- [ ] Customizar link (se tiver nome de empresa/etc)
- [ ] Traduzir para outros idiomas (se necessário)
- [ ] A/B test: QR vs botão "App Store" direto

### Com Distribuição Real (depois):
- [ ] Substituir `exp://` por deep links reais (quando publicar App Store/Play)
- [ ] Analytics: rastrear quantos usuários baixam
- [ ] Feedback: mostrar rating do app

---

## 📝 Commit

- **Hash:** 59d5778
- **Message:** "feat(web): add app download QR code to header dropdown"
- **Files:** 4 changed (DownloadAppModal.tsx criado, Header.tsx modificado)

---

## ✨ Resultado

Agora usuários web podem **descobrir e instalar o app mobile em 1 clique**, sem sair da plataforma. 

Interface amigável, instruções claras, 3 formas diferentes de acessar (QR scanner, button, link copy).

---

**Status:** 🟢 **Implementado & Pronto**
