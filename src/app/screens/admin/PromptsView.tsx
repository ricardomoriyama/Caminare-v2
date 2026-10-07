// =============================================================================
// Admin → Prompts da IA
// -----------------------------------------------------------------------------
// Permite ao admin ajustar a INSTRUÇÃO de cada um dos 3 prompts (emoções,
// crenças, padrões) sem commit nem deploy: salvou, o servidor passa a usar em
// até 1 minuto. O contrato de saída JSON é fixo no servidor e exibido aqui só
// como leitura, pra ficar claro o que é anexado automaticamente.
// Toda versão salva vai pro histórico e pode ser restaurada.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, History, Loader2, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/format';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  PROMPT_KEYS,
  getPromptDefaults,
  getPromptHistory,
  getSavedPrompts,
  resetPromptToDefault,
  savePrompt,
  type PromptDefault,
  type PromptHistoryItem,
  type PromptKey,
  type SavedPrompt,
} from '../../lib/prompts';

export function PromptsView() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [defaults, setDefaults] = useState<Record<PromptKey, PromptDefault> | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedPrompt>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState<PromptKey>('process_entry');

  // Texto em edição por prompt (começa igual ao salvo ou ao padrão).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [history, setHistory] = useState<PromptHistoryItem[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PromptHistoryItem | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [d, s] = await Promise.all([getPromptDefaults(), getSavedPrompts()]);
      if (!alive) return;
      if (!d) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setDefaults(d);
      setSaved(s);
      const initial: Record<string, string> = {};
      for (const k of PROMPT_KEYS) initial[k] = s[k]?.instructions ?? d[k].instructions;
      setDrafts(initial);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Recarrega o histórico ao trocar de prompt (se o painel estiver aberto).
  useEffect(() => {
    if (!historyOpen) return;
    let alive = true;
    setHistory(null);
    getPromptHistory(active).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [active, historyOpen]);

  const current = saved[active];
  const def = defaults?.[active];
  const draft = drafts[active] ?? '';
  const baseline = current?.instructions ?? def?.instructions ?? '';
  const dirty = draft.trim() !== baseline.trim();
  const isCustom = !!current;

  const labels = useMemo<Record<PromptKey, { title: string; desc: string }>>(
    () => ({
      process_entry: { title: t('admin.prompts.processEntry.title'), desc: t('admin.prompts.processEntry.desc') },
      analyze_beliefs: { title: t('admin.prompts.analyzeBeliefs.title'), desc: t('admin.prompts.analyzeBeliefs.desc') },
      detect_patterns: { title: t('admin.prompts.detectPatterns.title'), desc: t('admin.prompts.detectPatterns.desc') },
    }),
    [t]
  );

  async function handleSave() {
    if (!user || saving || !draft.trim()) return;
    setSaving(true);
    const row = await savePrompt(active, draft.trim(), user.id);
    setSaving(false);
    if (row) {
      setSaved((prev) => ({ ...prev, [active]: row }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      if (historyOpen) getPromptHistory(active).then(setHistory);
    }
  }

  async function handleReset() {
    if (!user || !def) return;
    setConfirmReset(false);
    setSaving(true);
    const ok = await resetPromptToDefault(active, user.id);
    setSaving(false);
    if (ok) {
      setSaved((prev) => {
        const next = { ...prev };
        delete next[active];
        return next;
      });
      setDrafts((prev) => ({ ...prev, [active]: def.instructions }));
      if (historyOpen) getPromptHistory(active).then(setHistory);
    }
  }

  function handleRestoreFromHistory(item: PromptHistoryItem) {
    // Só carrega no editor; o admin revisa e clica em Salvar pra valer.
    setDrafts((prev) => ({ ...prev, [active]: item.instructions }));
    setRestoreTarget(null);
    setHistoryOpen(false);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--cam-text-secondary)', padding: '48px 0', fontSize: 14 }}>
        <Loader2 size={20} className="animate-spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
        {t('common.loading')}
      </div>
    );
  }

  if (loadError || !def) {
    return (
      <div role="alert" style={alertStyle}>
        {t('admin.prompts.loadError')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Sparkles size={20} color="var(--cam-text-brand)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--cam-text-primary)' }}>
              {t('admin.prompts.title')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--cam-text-secondary)', lineHeight: 1.5 }}>
              {t('admin.prompts.intro')}
            </p>
          </div>
        </div>
      </div>

      {/* Seletor de prompt */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROMPT_KEYS.map((k) => {
          const isActive = k === active;
          const custom = !!saved[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setActive(k)}
              style={{
                padding: '10px 16px',
                borderRadius: 9999,
                border: `1.5px solid ${isActive ? 'var(--cam-color-brand)' : 'var(--cam-border)'}`,
                backgroundColor: isActive ? 'var(--cam-color-brand)' : 'var(--cam-bg-card)',
                color: isActive ? 'var(--cam-text-on-brand)' : 'var(--cam-text-primary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {labels[k].title}
              {custom && (
                <span
                  title={t('admin.prompts.customBadge')}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'var(--cam-text-on-brand)' : 'var(--cam-color-accent)',
                    display: 'inline-block',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--cam-text-primary)' }}>
              {labels[active].title}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--cam-text-secondary)', lineHeight: 1.5 }}>
              {labels[active].desc}
            </p>
          </div>
          <div style={{ fontSize: 12, color: 'var(--cam-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {isCustom ? (
              <>
                <div style={{ fontWeight: 600, color: 'var(--cam-text-accent)' }}>
                  {t('admin.prompts.versionCustom', { version: current.version })}
                </div>
                <div>{formatDate(current.updated_at, i18n.language).date}</div>
              </>
            ) : (
              <div style={{ fontWeight: 600 }}>{t('admin.prompts.versionDefault')}</div>
            )}
          </div>
        </div>

        <label style={{ display: 'block', marginTop: 16 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--cam-text-secondary)', marginBottom: 8 }}>
            {t('admin.prompts.instructionsLabel')}
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [active]: e.target.value }))}
            disabled={saving}
            spellCheck={false}
            rows={18}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 14,
              borderRadius: 14,
              border: `1px solid var(--cam-border)`,
              backgroundColor: 'var(--cam-bg-input)',
              color: 'var(--cam-text-primary)',
              fontSize: 14,
              lineHeight: 1.55,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </label>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty || !draft.trim()}
            style={{
              ...primaryBtn,
              opacity: saving || !dirty || !draft.trim() ? 0.55 : 1,
              cursor: saving || !dirty || !draft.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : savedFlash ? <Check size={16} strokeWidth={2.5} /> : <Save size={16} strokeWidth={2.5} />}
            {savedFlash ? t('admin.prompts.saved') : t('common.save')}
          </button>

          {dirty && (
            <button
              type="button"
              onClick={() => setDrafts((prev) => ({ ...prev, [active]: baseline }))}
              disabled={saving}
              style={ghostBtn}
            >
              <X size={16} />
              {t('admin.prompts.discard')}
            </button>
          )}

          <div style={{ flex: 1 }} />

          <button type="button" onClick={() => setHistoryOpen((v) => !v)} style={ghostBtn}>
            <History size={16} />
            {t('admin.prompts.history')}
          </button>

          {isCustom && (
            <button type="button" onClick={() => setConfirmReset(true)} disabled={saving} style={{ ...ghostBtn, color: 'var(--cam-text-error)' }}>
              <RotateCcw size={16} />
              {t('admin.prompts.resetDefault')}
            </button>
          )}
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--cam-text-secondary)', lineHeight: 1.5 }}>
          {t('admin.prompts.effectNote')}
        </p>
      </div>

      {/* Histórico */}
      {historyOpen && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--cam-text-primary)' }}>
            {t('admin.prompts.historyTitle')}
          </h3>
          {history === null && (
            <div style={{ color: 'var(--cam-text-secondary)', fontSize: 13 }}>{t('common.loading')}</div>
          )}
          {history && history.length === 0 && (
            <div style={{ color: 'var(--cam-text-secondary)', fontSize: 13 }}>{t('admin.prompts.historyEmpty')}</div>
          )}
          {history && history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid var(--cam-border-subtle)`,
                    backgroundColor: 'var(--cam-bg-page)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--cam-text-secondary)', marginBottom: 6 }}>
                      {t('admin.prompts.versionCustom', { version: h.version })} · {formatDate(h.saved_at, i18n.language).date}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--cam-text-primary)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        whiteSpace: 'pre-wrap',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {h.instructions}
                    </div>
                  </div>
                  <button type="button" onClick={() => setRestoreTarget(h)} style={{ ...ghostBtn, flexShrink: 0 }}>
                    <RotateCcw size={14} />
                    {t('admin.prompts.loadVersion')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contrato fixo (somente leitura) */}
      <div style={cardStyle}>
        <button
          type="button"
          onClick={() => setShowContract((v) => !v)}
          style={{ ...ghostBtn, padding: 0, border: 'none', background: 'none' }}
        >
          {showContract ? t('admin.prompts.hideContract') : t('admin.prompts.showContract')}
        </button>
        {showContract && (
          <>
            <p style={{ margin: '12px 0 8px', fontSize: 13, color: 'var(--cam-text-secondary)', lineHeight: 1.5 }}>
              {t('admin.prompts.contractNote')}
            </p>
            <pre
              style={{
                margin: 0,
                padding: 14,
                borderRadius: 14,
                backgroundColor: 'var(--cam-bg-page)',
                border: `1px solid var(--cam-border-subtle)`,
                color: 'var(--cam-text-secondary)',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              {def.contract}
            </pre>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t('admin.prompts.resetDefault')}
        message={t('admin.prompts.resetConfirm')}
        confirmLabel={t('admin.prompts.resetDefault')}
        destructive
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={!!restoreTarget}
        title={t('admin.prompts.loadVersion')}
        message={t('admin.prompts.loadVersionConfirm', { version: restoreTarget?.version ?? '' })}
        confirmLabel={t('admin.prompts.loadVersion')}
        onConfirm={() => restoreTarget && handleRestoreFromHistory(restoreTarget)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--cam-bg-card)',
  borderRadius: 20,
  padding: 20,
  boxShadow: 'var(--cam-shadow-card)',
};

const alertStyle: React.CSSProperties = {
  backgroundColor: 'var(--cam-bg-error-soft)',
  color: 'var(--cam-text-error)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 500,
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 42,
  padding: '0 18px',
  borderRadius: 9999,
  border: 'none',
  backgroundColor: 'var(--cam-color-brand)',
  color: 'var(--cam-text-on-brand)',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 42,
  padding: '0 14px',
  borderRadius: 9999,
  border: `1.5px solid var(--cam-border)`,
  backgroundColor: 'transparent',
  color: 'var(--cam-text-brand)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
