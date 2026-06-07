'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

// Versão vigente do termo — ao revisar o texto, troque esta data.
// Usuários que aceitaram uma versão anterior serão questionados novamente.
export const VERSAO_TERMOS = '2026-06-07'

const TEXTO_TERMOS = `
TERMO DE USO E TRATAMENTO DE DADOS — CHECKFLOW

1. Sobre este Termo
O CheckFlow é uma plataforma de gestão de checklists, processos e qualidade
contratada pela empresa à qual você está vinculado ("Empresa Contratante")
para uso por seus colaboradores, prestadores e parceiros autorizados.

Ao acessar e utilizar o sistema, você declara estar ciente e de acordo com
as condições abaixo.

2. Titularidade dos Dados
Todos os dados inseridos, gerados ou armazenados durante o uso do sistema
— incluindo respostas de checklists, evidências (fotos, vídeos, assinaturas,
documentos), localização, planos de ação e demais registros — são de
propriedade e responsabilidade da Empresa Contratante, que é a controladora
desses dados perante a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).

3. Finalidade do Tratamento
Os dados coletados têm como finalidade exclusiva a operação, supervisão,
auditoria e melhoria contínua dos processos da Empresa Contratante,
incluindo o registro de execuções, não conformidades, planos de ação,
comunicações de moderação e geração de relatórios e indicadores.

4. Uso de Geolocalização e Mídia
Determinadas atividades podem solicitar acesso à localização do dispositivo,
câmera, microfone ou galeria de mídia, exclusivamente para fins de registro
e comprovação da execução dos checklists. Esses recursos só são acionados
mediante sua autorização explícita pelo navegador/dispositivo.

5. Comunicações
O sistema pode enviar mensagens automáticas (e-mail e/ou WhatsApp) relativas
a não conformidades, planos de ação e moderações, conforme as regras de
notificação configuradas pela Empresa Contratante (incluindo, quando
aplicável, restrições de horário por turno de trabalho).

6. Responsabilidades do Usuário
Você é responsável pela veracidade das informações registradas, pela guarda
de suas credenciais de acesso e pelo uso adequado do sistema, em conformidade
com as políticas internas da Empresa Contratante.

7. Confidencialidade
As informações às quais você tiver acesso através do sistema são confidenciais
e não devem ser compartilhadas, copiadas ou divulgadas a terceiros sem
autorização expressa da Empresa Contratante.

8. Alterações deste Termo
Este termo pode ser atualizado periodicamente. Caso haja alterações
relevantes, uma nova confirmação de aceite poderá ser solicitada no
seu próximo acesso.

9. Aceite
Ao clicar em "Li e aceito os termos", você confirma que leu, compreendeu
e concorda integralmente com as condições acima descritas.
`.trim()

interface Props {
  visible: boolean
  onAceitar: () => void
}

export function TermosDeUsoModal({ visible, onAceitar }: Props) {
  const [salvando, setSalvando] = useState(false)
  const [lido, setLido] = useState(false)

  useEffect(() => {
    if (visible) setLido(false)
  }, [visible])

  if (!visible) return null

  async function aceitar() {
    setSalvando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('usuarios').update({
        termos_aceitos_em: new Date().toISOString(),
        termos_versao_aceita: VERSAO_TERMOS,
      }).eq('id', user.id)
    }
    setSalvando(false)
    onAceitar()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <ShieldCheck size={20} className="text-orange-500" />
          <h2 className="text-lg font-semibold text-slate-800">Termo de Uso e Tratamento de Dados</h2>
        </div>

        <div
          className="overflow-y-auto px-6 py-4 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed flex-1"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setLido(true)
          }}
        >
          {TEXTO_TERMOS}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {!lido && (
            <p className="text-xs text-amber-600 mb-2">Role até o final do texto para habilitar o aceite.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={aceitar} disabled={!lido || salvando}>
              {salvando ? 'Registrando...' : 'Li e aceito os termos'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
