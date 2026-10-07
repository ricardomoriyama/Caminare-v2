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

  const { data: profile } = await serviceClient()
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) return sendError(res, 403, 'Acesso restrito a administradores.');

  return sendJson(res, 200, { status: 'ok', prompts: PROMPT_DEFAULTS });
}
