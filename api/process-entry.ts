// =============================================================================
// POST /api/process-entry
// -----------------------------------------------------------------------------
// Recebe um registro recém-salvo, extrai emoções + pensamentos (Prompt 1) e
// persiste: emoções em `emotions` (validation 'pending') e pensamentos em
// `entry_analysis_logs.parsed_thoughts`. Também grava o status de processamento
// em `entries` e é idempotente (não reprocessa um registro já 'done').
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  readJsonBody,
  requireUser,
  serviceClient,
  sendJson,
  sendError,
} from './_lib/runtime.js';
import { applyCors } from './_lib/cors.js';
import { runStructured, CLAUDE_MODEL } from './_lib/claude.js';
import { buildProcessEntryUser } from './_lib/prompts.js';
import { getSystemPrompt, promptVersionLabel } from './_lib/prompt-loader.js';
import { trackServer } from './_lib/analytics.js';

// 60s: Claude com timeout 25s + 1 retry (~50s no pior caso). Com 30s dava 504
// (FUNCTION_INVOCATION_TIMEOUT) quando a IA demorava. Mesmo motivo do analyze-beliefs.
export const config = { maxDuration: 60 };

// Versão atual dos prompts (coluna NOT NULL em entry_analysis_logs).
const PROMPT_VERSION = '1.3.1';

interface Body {
  entry_id?: string;
  transcricao?: string;
  idioma?: string;
  qualidade?: string | null;
  historico_resumido?: string | null;
  data_hora?: string;
}

interface AiEmotion {
  nome: string;
  intensidade?: string;
  confianca?: number;
}
interface AiResult {
  status?: string;
  emocoes?: AiEmotion[];
}

// Normaliza a intensidade para o enum `emotion_intensity` do banco:
// 'subtle' | 'moderate' | 'strong' | 'very_strong'. Aceita o vocabulário PT que
// o Prompt 1 produz (sutil/moderada/alta) e equivalentes em inglês. Fallback
// seguro = 'moderate' (a coluna não aceita valor fora do enum).
function mapIntensity(v?: string): 'subtle' | 'moderate' | 'strong' | 'very_strong' {
  switch ((v ?? '').toLowerCase().trim()) {
    case 'sutil':
    case 'subtle':
    case 'low':
      return 'subtle';
    case 'moderada':
    case 'moderate':
    case 'medium':
      return 'moderate';
    case 'alta':
    case 'high':
    case 'strong':
      return 'strong';
    case 'muito alta':
    case 'muito forte':
    case 'very_strong':
    case 'very strong':
    case 'very high':
      return 'very_strong';
    default:
      return 'moderate';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const body = readJsonBody<Body>(req, res);
  if (!body) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const entryId = body.entry_id;
  if (!entryId) return sendError(res, 400, 'entry_id é obrigatório.');

  const db = serviceClient();

  // 1) Carrega o registro e confirma que pertence ao usuário autenticado.
  const { data: entry, error: entryErr } = await db
    .from('entries')
    .select('id, user_id, raw_text, processing_status, created_at')
    .eq('id', entryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (entryErr) {
    console.error('[process-entry] erro ao buscar entry:', entryErr);
    return sendError(res, 500, 'Não foi possível carregar o registro.');
  }
  if (!entry) return sendError(res, 404, 'Registro não encontrado.');

  // 2) Idempotência: se já foi processado, devolve o que existe sem reprocessar.
  if (entry.processing_status === 'done') {
    const { data: emo } = await db
      .from('emotions')
      .select('name, intensity')
      .eq('entry_id', entryId)
      .neq('validation', 'rejected');
    return sendJson(res, 200, {
      status: 'already_processed',
      emocoes: (emo ?? []).map((e) => ({ nome: e.name, intensidade: e.intensity })),
    });
  }

  const transcricao = (body.transcricao ?? entry.raw_text ?? '').trim();
  if (!transcricao) return sendError(res, 400, 'Registro sem texto para analisar.');

  // Claim atômico: só processa quem conseguir mudar pending/failed → processing.
  // Evita processamento duplicado quando a gravação dispara /api/process-entry em
  // background E a tela de validação também o chama (corrida). O update condicional
  // é atômico no Postgres: apenas uma requisição "ganha"; as demais recebem 202.
  const { data: claimed, error: claimErr } = await db
    .from('entries')
    .update({ processing_status: 'processing' })
    .eq('id', entryId)
    .in('processing_status', ['pending', 'failed'])
    .select('id');
  if (claimErr) {
    console.error('[process-entry] erro ao reivindicar processamento:', claimErr);
    return sendError(res, 500, 'Não foi possível iniciar a análise.');
  }
  if (!claimed || claimed.length === 0) {
    // Outra requisição já está processando este registro — o cliente deve
    // aguardar (poll do status) em vez de reprocessar.
    return sendJson(res, 202, { status: 'processing' });
  }

  const promptStart = Date.now();
  try {
    // 3) Monta histórico resumido (contexto) a partir dos últimos registros.
    const historicoResumido = body.historico_resumido ?? (await buildHistorico(db, user.id, entryId));

    // 4) Chama o Claude. O prompt de sistema vem do carregador: instrução editável
    //    pelo admin (tabela ai_prompts) + contrato JSON fixo do código.
    const prompt = await getSystemPrompt('process_entry');
    const { data: ai, raw } = await runStructured<AiResult>(
      prompt.system,
      buildProcessEntryUser({
        transcricao,
        idioma: body.idioma ?? 'pt-BR',
        qualidade: body.qualidade ?? null,
        historicoResumido,
        dataHora: body.data_hora ?? entry.created_at,
      }),
      1500
    );
    void trackServer(user.id, {
      name: 'analysis_prompt_run',
      params: { prompt_id: 'prompt01', status: 'completed', duration_ms: Date.now() - promptStart },
    });

    const emocoes = (ai.emocoes ?? []).slice(0, 6).filter((e) => e?.nome?.trim());

    // 5) Persiste emoções (validation 'pending') e o log de análise.
    if (emocoes.length) {
      const rows = emocoes.map((e) => ({
        user_id: user.id,
        entry_id: entryId,
        name: e.nome.trim(),
        name_original: e.nome.trim(),
        source: 'ai' as const,
        validation: 'pending' as const,
        intensity: mapIntensity(e.intensidade),
      }));
      const { error: insErr } = await db.from('emotions').insert(rows);
      // Resiliência ao deploy: se a coluna `source` ainda não existir (42703),
      // reinsere sem ela para não perder as emoções.
      if (insErr?.code === '42703') {
        const fallback = rows.map(({ source, ...rest }) => rest);
        const { error: fbErr } = await db.from('emotions').insert(fallback);
        if (fbErr) console.error('[process-entry] erro ao inserir emoções (fallback):', fbErr);
      } else if (insErr) {
        console.error('[process-entry] erro ao inserir emoções:', insErr);
      }
    }

    const logErr = await insertAnalysisLog(
      db,
      user.id,
      entryId,
      raw,
      promptVersionLabel(PROMPT_VERSION, prompt)
    );
    if (logErr) console.error('[process-entry] erro ao inserir log de análise:', logErr);

    await db.from('entries').update({ processing_status: 'done' }).eq('id', entryId);

    return sendJson(res, 200, {
      status: 'ok',
      emocoes,
    });
  } catch (err) {
    console.error('[process-entry] falha na análise:', err);
    void trackServer(user.id, {
      name: 'analysis_prompt_run',
      params: { prompt_id: 'prompt01', status: 'failed', duration_ms: Date.now() - promptStart },
    });
    await db.from('entries').update({ processing_status: 'failed' }).eq('id', entryId);
    return sendError(res, 502, 'Não foi possível analisar o relato agora. Tente novamente.');
  }
}

// Resumo curto dos últimos registros (contexto, não fonte de extração).
async function buildHistorico(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  excludeEntryId: string
): Promise<string> {
  const { data } = await db
    .from('entries')
    .select('raw_text, created_at, emotions(name, validation)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .neq('id', excludeEntryId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data?.length) return '';

  return data
    .map((row: { raw_text: string | null; created_at: string; emotions: { name: string; validation: string }[] | null }) => {
      const date = new Date(row.created_at).toISOString().slice(0, 10);
      const emo = (row.emotions ?? [])
        .filter((e) => e.validation === 'confirmed')
        .map((e) => e.name)
        .join(', ');
      const snippet = (row.raw_text ?? '').slice(0, 160);
      return `  • [${date}] ${snippet}${emo ? ` (emoções: ${emo})` : ''}`;
    })
    .join('\n');
}

// Insere o log de análise preenchendo as colunas NOT NULL:
// prompt_version, ai_model e raw_response (resposta bruta da API em JSON string).
// Pensamentos não são mais extraídos: parsed_thoughts grava sempre lista vazia.
async function insertAnalysisLog(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  entryId: string,
  rawResponse: unknown,
  promptVersion: string = PROMPT_VERSION
): Promise<unknown> {
  const { error } = await db.from('entry_analysis_logs').insert({
    user_id: userId,
    entry_id: entryId,
    parsed_thoughts: [],
    prompt_version: promptVersion,
    ai_model: CLAUDE_MODEL,
    raw_response: JSON.stringify(rawResponse),
  });
  return error;
}
