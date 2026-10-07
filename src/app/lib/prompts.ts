// =============================================================================
// Caminare — Prompts da IA editáveis pelo admin (cliente)
// -----------------------------------------------------------------------------
// O admin edita só a INSTRUÇÃO de cada prompt (tabela ai_prompts, protegida por
// RLS de admin). O contrato de saída JSON é fixo no servidor e anexado por ele.
// Os padrões do código (pra "Restaurar padrão" e pra mostrar o contrato) vêm do
// endpoint GET /api/admin-prompts. Toda versão salva fica em ai_prompt_history.
// =============================================================================

import { supabase } from './supabase';
import { apiUrl } from './api';

export type PromptKey = 'process_entry' | 'analyze_beliefs' | 'detect_patterns';
export const PROMPT_KEYS: PromptKey[] = ['process_entry', 'analyze_beliefs', 'detect_patterns'];

export interface PromptDefault {
  instructions: string;
  contract: string;
}

export interface SavedPrompt {
  key: PromptKey;
  instructions: string;
  version: number;
  updated_at: string;
}

export interface PromptHistoryItem {
  id: number;
  version: number;
  instructions: string;
  saved_at: string;
}

/**
 * Padrões do código (instrução + contrato fixo) de cada prompt. Só admin.
 * Lê primeiro do banco (ai_prompt_defaults, RLS de admin, mesmo caminho que já
 * funciona pros prompts salvos). Se a tabela ainda estiver vazia, chama o
 * endpoint, que devolve os padrões E os grava no banco pras próximas vezes.
 */
export async function getPromptDefaults(): Promise<Record<PromptKey, PromptDefault> | null> {
  const fromDb = await readDefaultsFromDb();
  if (fromDb) return fromDb;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(apiUrl('/api/admin-prompts'), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      console.error('[prompts.getPromptDefaults] endpoint respondeu', res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { prompts?: Record<PromptKey, PromptDefault> };
    return json.prompts ?? null;
  } catch (err) {
    console.error('[prompts.getPromptDefaults]', err);
    return null;
  }
}

async function readDefaultsFromDb(): Promise<Record<PromptKey, PromptDefault> | null> {
  try {
    const { data, error } = await supabase.from('ai_prompt_defaults').select('key, instructions, contract');
    if (error || !data) return null;
    const rows = data as Array<{ key: PromptKey; instructions: string; contract: string }>;
    if (!PROMPT_KEYS.every((k) => rows.some((r) => r.key === k))) return null;
    const out = {} as Record<PromptKey, PromptDefault>;
    for (const r of rows) out[r.key] = { instructions: r.instructions, contract: r.contract };
    return out;
  } catch {
    return null;
  }
}

/** Instruções salvas pelo admin (pode faltar key: aí vale o padrão do código). */
export async function getSavedPrompts(): Promise<Record<string, SavedPrompt>> {
  try {
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('key, instructions, version, updated_at');
    if (error) {
      console.error('[prompts.getSavedPrompts]', error);
      return {};
    }
    const out: Record<string, SavedPrompt> = {};
    for (const row of (data ?? []) as SavedPrompt[]) out[row.key] = row;
    return out;
  } catch (err) {
    console.error('[prompts.getSavedPrompts]', err);
    return {};
  }
}

/**
 * Salva a instrução de um prompt. Upsert: cria a linha na 1ª vez, atualiza nas
 * seguintes (o trigger no banco arquiva a versão anterior e incrementa a versão).
 * Entra em vigor no servidor em até 1 minuto (cache do carregador).
 */
export async function savePrompt(key: PromptKey, instructions: string, userId: string): Promise<SavedPrompt | null> {
  try {
    const { data, error } = await supabase
      .from('ai_prompts')
      .upsert({ key, instructions, updated_by: userId }, { onConflict: 'key' })
      .select('key, instructions, version, updated_at')
      .single();
    if (error) {
      console.error('[prompts.savePrompt]', error);
      return null;
    }
    return data as SavedPrompt;
  } catch (err) {
    console.error('[prompts.savePrompt]', err);
    return null;
  }
}

/**
 * "Restaurar padrão": apaga a linha salva, então o servidor volta a usar o texto
 * do código. A versão salva fica no histórico (o trigger só roda em UPDATE, por
 * isso arquivamos manualmente aqui antes de apagar).
 */
export async function resetPromptToDefault(key: PromptKey, userId: string): Promise<boolean> {
  try {
    const { data: current } = await supabase
      .from('ai_prompts')
      .select('instructions, version, updated_at')
      .eq('key', key)
      .maybeSingle();
    if (current) {
      await supabase.from('ai_prompt_history').insert({
        key,
        instructions: current.instructions,
        version: current.version,
        saved_at: current.updated_at,
        saved_by: userId,
      });
    }
    const { error } = await supabase.from('ai_prompts').delete().eq('key', key);
    if (error) {
      console.error('[prompts.resetPromptToDefault]', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[prompts.resetPromptToDefault]', err);
    return false;
  }
}

/** Versões anteriores de um prompt, da mais recente pra mais antiga. */
export async function getPromptHistory(key: PromptKey, limit = 20): Promise<PromptHistoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('ai_prompt_history')
      .select('id, version, instructions, saved_at')
      .eq('key', key)
      .order('version', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[prompts.getPromptHistory]', error);
      return [];
    }
    return (data ?? []) as PromptHistoryItem[];
  } catch (err) {
    console.error('[prompts.getPromptHistory]', err);
    return [];
  }
}
