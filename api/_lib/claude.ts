// =============================================================================
// Caminare — Wrapper do Claude (Anthropic SDK)
// -----------------------------------------------------------------------------
// Centraliza: modelo, prompt caching no bloco SISTEMA, retry simples (1 tentativa
// extra) e extração defensiva do JSON retornado.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './runtime.js';

// Sonnet 4.5 foi aposentado pela Anthropic (fim do suporte em 24/11/2026,
// instabilidade a partir de 30/10/2026). Sonnet 5 é o substituto recomendado:
// mais capaz e mais barato. Único lugar que define o modelo; todos os
// endpoints (process-entry, analyze-beliefs, detect-patterns...) usam daqui.
export const CLAUDE_MODEL = 'claude-sonnet-5';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  // timeout por chamada < maxDuration (30s) do endpoint, deixando folga p/ retry.
  _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY(), timeout: 25_000, maxRetries: 0 });
  return _client;
}

export interface StructuredResult<T> {
  /** JSON já parseado da resposta. */
  data: T;
  /** Resposta bruta da API Anthropic (para auditoria/log). */
  raw: Anthropic.Message;
}

/**
 * Executa uma chamada ao Claude e devolve o JSON parseado + a resposta bruta.
 *
 * @param systemPrompt Bloco SISTEMA fixo — recebe cache_control: ephemeral
 *                     (prompt caching), pois é longo e imutável entre chamadas.
 * @param userContent  Parte variável (contexto + dados/relato) no turno do user.
 * @param maxTokens    Limite de tokens de saída.
 */
export async function runStructured<T>(
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): Promise<StructuredResult<T>> {
  const doCall = () =>
    client().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // Prompt caching: reaproveita o prefixo fixo entre chamadas, reduzindo
          // custo e latência. (Cache só ativa acima do mínimo de tokens do modelo.)
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userContent }],
    });

  let raw: Anthropic.Message;
  try {
    raw = await doCall();
  } catch (err) {
    // Retry simples: 1 tentativa extra antes de desistir.
    console.error('[claude] primeira tentativa falhou, tentando novamente:', err);
    raw = await doCall();
  }

  const text = raw.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return { data: extractJson<T>(text), raw };
}

/**
 * Extrai e parseia JSON de uma string, tolerando cercas de código (```json)
 * ou texto acidental ao redor do objeto.
 */
export function extractJson<T>(text: string): T {
  let candidate = text.trim();

  // Remove cercas de código, se houver.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();

  // Tenta parse direto.
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Fallback: recorta do primeiro { (ou [) até o último } (ou ]).
    const firstObj = candidate.indexOf('{');
    const firstArr = candidate.indexOf('[');
    const start =
      firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
    const lastObj = candidate.lastIndexOf('}');
    const lastArr = candidate.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error('Resposta da IA não continha JSON válido.');
  }
}
