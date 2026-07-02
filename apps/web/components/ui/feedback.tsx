'use client'

/**
 * Sistema de feedback unificado do CheckFlow — substitui os alert()/confirm()
 * nativos do navegador por toasts e diálogos estilizados.
 *
 * Uso:
 *   const toast = useToast()
 *   toast.success('Salvo com sucesso')
 *   toast.error('Falha ao salvar')
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ titulo: 'Excluir?', perigo: true })) { ... }
 *
 * Ambos os provedores são montados uma única vez via <FeedbackProvider> no
 * layout raiz.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'

// ─── Toast ──────────────────────────────────────────────────────────────────

type ToastTipo = 'success' | 'error' | 'info'
interface ToastItem { id: number; tipo: ToastTipo; mensagem: string }

interface ToastApi {
  success: (mensagem: string) => void
  error: (mensagem: string) => void
  info: (mensagem: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TOAST_ESTILO: Record<ToastTipo, { cor: string; icone: React.ReactNode }> = {
  success: { cor: 'border-green-200 bg-green-50 text-green-800', icone: <CheckCircle2 size={16} className="text-green-500" /> },
  error:   { cor: 'border-red-200 bg-red-50 text-red-800',       icone: <XCircle size={16} className="text-red-500" /> },
  info:    { cor: 'border-blue-200 bg-blue-50 text-blue-800',    icone: <Info size={16} className="text-blue-500" /> },
}

// ─── Confirm ────────────────────────────────────────────────────────────────

interface ConfirmOpcoes {
  titulo: string
  mensagem?: string
  confirmarLabel?: string
  cancelarLabel?: string
  perigo?: boolean
}
type ConfirmApi = (opcoes: ConfirmOpcoes) => Promise<boolean>

const ConfirmContext = createContext<ConfirmApi | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const push = useCallback((tipo: ToastTipo, mensagem: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, tipo, mensagem }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000)
  }, [])

  const toastApi = useRef<ToastApi>({
    success: m => push('success', m),
    error:   m => push('error', m),
    info:    m => push('info', m),
  }).current

  // Confirm
  const [confirmState, setConfirmState] = useState<(ConfirmOpcoes & { resolve: (v: boolean) => void }) | null>(null)

  const confirm = useCallback<ConfirmApi>((opcoes) => {
    return new Promise<boolean>(resolve => setConfirmState({ ...opcoes, resolve }))
  }, [])

  function fecharConfirm(valor: boolean) {
    confirmState?.resolve(valor)
    setConfirmState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toastApi}>
        {children}

        {/* Pilha de toasts — canto inferior direito */}
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
          {toasts.map(t => (
            <div key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-sm text-sm animate-[slideIn_0.15s_ease-out] ${TOAST_ESTILO[t.tipo].cor}`}>
              <span className="flex-shrink-0 mt-0.5">{TOAST_ESTILO[t.tipo].icone}</span>
              <span className="flex-1 leading-snug">{t.mensagem}</span>
              <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="flex-shrink-0 text-current opacity-40 hover:opacity-100 transition-opacity">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Diálogo de confirmação */}
        {confirmState && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
            onClick={() => fecharConfirm(false)}>
            <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5">
                <div className="flex items-start gap-3">
                  {confirmState.perigo && (
                    <span className="flex-shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                      <AlertTriangle size={18} className="text-red-500" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-800">{confirmState.titulo}</h2>
                    {confirmState.mensagem && (
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">{confirmState.mensagem}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" size="sm" onClick={() => fecharConfirm(false)}>
                    {confirmState.cancelarLabel ?? 'Cancelar'}
                  </Button>
                  <Button size="sm" onClick={() => fecharConfirm(true)}
                    className={confirmState.perigo ? '!bg-red-600 hover:!bg-red-700' : ''}>
                    {confirmState.confirmarLabel ?? 'Confirmar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  )
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <FeedbackProvider>')
  return ctx
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <FeedbackProvider>')
  return ctx
}
