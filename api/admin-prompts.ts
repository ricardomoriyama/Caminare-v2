// =============================================================================
// GET /api/admin-prompts
// -----------------------------------------------------------------------------
// Devolve, para o painel admin, a instrução PADRÃO (do código) e o contrato JSON
// fixo de cada prompt. O painel usa:
//   - defaults  → botão "Restaurar padrão" e conteúdo inicial quando nada foi salvo
//   - contracts → exibir (somente leitura) o que é anexado automaticamente
// A leitura/escrita do que o admin salvou é feita direto no Supabase pelo app
// (tabela ai_prompts, protegida por RLS de admin). Só admin pode chamar aqui.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, serviceClient, sendJson, sendError } from './_lib/runtime.js';
import { applyCors } from './_lib/cors.js';
import { PROMPT_DEFAULTS } from './_lib/prompts.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Método não permitido. Use GET.');

  const user = await requireUser(req, res);
  if (!user) return;

  const { data: profile, error } = await serviceClient()
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  // Erro de leitura (ex.: chave de serviço ausente/errada) NÃO pode virar 403
  // silencioso: devolve 500 com o motivo pra ser diagnosticável.
  if (error) {
    console.error('[admin-prompts] falha ao ler profiles:', error);
    return sendError(res, 500, `Falha ao verificar permissão: ${error.message}`);
  }
  if (!profile?.is_admin) return sendError(res, 403, 'Acesso restrito a administradores.');

  // Espelha os padrões do código no banco (ai_prompt_defaults), pra o painel
  // conseguir ler direto do Supabase sem depender deste endpoint. Best-effort.
  try {
    await serviceClient()
      .from('ai_prompt_defaults')
      .upsert(
        (Object.keys(PROMPT_DEFAULTS) as Array<keyof typeof PROMPT_DEFAULTS>).map((key) => ({
          key,
          instructions: PROMPT_DEFAULTS[key].instructions,
          contract: PROMPT_DEFAULTS[key].contract,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'key' }
      );
  } catch (err) {
    console.warn('[admin-prompts] sync de ai_prompt_defaults falhou (ignorado):', err);
  }

  return sendJson(res, 200, { status: 'ok', prompts: PROMPT_DEFAULTS });
}
