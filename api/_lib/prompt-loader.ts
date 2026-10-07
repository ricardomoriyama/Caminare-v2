// =============================================================================
// Caminare — Carregador dos prompts editáveis
// -----------------------------------------------------------------------------
// O admin pode ajustar a INSTRUÇÃO de cada prompt no painel (tabela ai_prompts)
// sem commit nem deploy. Aqui montamos o prompt de sistema final:
//
//     SYSTEM = instrução (banco, ou padrão do código se não houver) + contrato JSON (fixo)
//
// O contrato fica sempre no código, então o admin nunca consegue quebrar os nomes
// dos campos que o app lê. Cache em memória de 60s: a função serverless costuma
// ser reaproveitada entre chamadas, então quase nunca bate no banco, e uma
// mudança no painel entra em vigor em até 1 minuto.
//
// Nunca lança: qualquer falha ao ler o banco cai no padrão do código, pra a
// análise nunca parar por causa do painel.
// =============================================================================

import { serviceClient } from './runtime.js';
import { PROMPT_DEFAULTS, type PromptKey } from './prompts.js';

const CACHE_TTL_MS = 60_000;

interface Cached {
  system: string;
  version: number;
  at: number;
}

const cache = new Map<PromptKey, Cached>();

export interface LoadedPrompt {
  /** Prompt de sistema completo (instrução + contrato), pronto pra enviar ao modelo. */
  system: string;
  /** Versão da instrução (0 = padrão do código; >=1 = salva pelo admin). */
  version: number;
}

/**
 * Devolve o prompt de sistema de `key`, usando a instrução salva pelo admin se
 * existir, senão o padrão do código. Sempre anexa o contrato JSON fixo.
 */
export async function getSystemPrompt(key: PromptKey): Promise<LoadedPrompt> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { system: hit.system, version: hit.version };
  }

  const def = PROMPT_DEFAULTS[key];
  let instructions = def.instructions;
  let version = 0;

  try {
    const { data } = await serviceClient()
      .from('ai_prompts')
      .select('instructions, version')
      .eq('key', key)
      .maybeSingle();
    if (data?.instructions?.trim()) {
      instructions = data.instructions;
      version = data.version ?? 1;
    }
  } catch (err) {
    console.warn(`[prompt-loader] falha ao ler ai_prompts(${key}); usando padrão:`, err);
  }

  const system = `${instructions.trim()}\n\n${def.contract}`;
  cache.set(key, { system, version, at: Date.now() });
  return { system, version };
}

/**
 * Rótulo de versão do prompt para gravar nos logs de análise, ex.: "1.3.1" quando
 * é o padrão do código, ou "1.3.1+db3" quando é a 3ª versão salva pelo admin.
 * Assim dá pra saber qual texto gerou cada análise.
 */
export function promptVersionLabel(codeVersion: string, loaded: LoadedPrompt): string {
  return loaded.version > 0 ? `${codeVersion}+db${loaded.version}` : codeVersion;
}
