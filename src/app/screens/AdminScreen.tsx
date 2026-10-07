import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Users,
  Heart,
  Brain,
  TrendingUp,
  MessageSquare,
  Check,
  Eye,
  CircleDot,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PromptsView } from './admin/PromptsView';
import {
  getAdminStats,
  getAdminFeedback,
  updateFeedbackStatus,
  getAdminUsers,
  getAdminEmotions,
  getAdminBeliefs,
  getAdminPatterns,
  getProfile,
  type AdminStats,
  type AdminEmotions,
  type AdminBeliefs,
  type AdminPatternsData,
  type AdminPeriod,
  type FeedbackItem,
  type FeedbackStatus,
  type AdminUser,
  type Profile,
} from '../lib/db';
import { formatDate } from '../lib/format';

type FeedbackFilter = 'all' | FeedbackStatus;
type AdminSection = 'overview' | 'emotions' | 'beliefs' | 'patterns' | 'users' | 'feedback' | 'prompts';
const DETAIL_SECTIONS: AdminSection[] = ['emotions', 'beliefs', 'patterns'];

const SIDEBAR_WIDTH = 256;

export function AdminScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();

  const [section, setSection] = useState<AdminSection>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filtro de período (topo das abas de detalhe) e dados das RPCs por aba.
  const [period, setPeriod] = useState<AdminPeriod>('all');
  const [emotionsData, setEmotionsData] = useState<AdminEmotions | null>(null);
  const [beliefsData, setBeliefsData] = useState<AdminBeliefs | null>(null);
  const [patternsData, setPatternsData] = useState<AdminPatternsData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Bump pra forçar re-fetch dos dados da aba de detalhe (usado pelo botão atualizar).
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // Carrega profile uma vez
  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(setProfile);
  }, [user]);

  const load = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const [statsData, fbData] = await Promise.all([
        getAdminStats(),
        getAdminFeedback(feedbackFilter === 'all' ? undefined : feedbackFilter),
      ]);
      if (!statsData) setError(t('admin.errorLoad'));
      setStats(statsData);
      setFeedback(fbData);
      setLoading(false);
      setRefreshing(false);
    },
    [feedbackFilter, t]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Carrega lista de usuários só quando o admin abrir essa seção
  useEffect(() => {
    if (section !== 'users') return;
    if (users !== null) return; // já carregou
    let active = true;
    setUsersLoading(true);
    getAdminUsers().then((u) => {
      if (!active) return;
      setUsers(u);
      setUsersLoading(false);
    });
    return () => {
      active = false;
    };
  }, [section, users]);

  // Carrega os dados da aba de detalhe ativa (emoções/crenças/padrões),
  // refazendo a busca quando o período muda. As RPCs recebem o range.
  useEffect(() => {
    if (!DETAIL_SECTIONS.includes(section)) return;
    let active = true;
    setDetailLoading(true);
    const fetcher =
      section === 'emotions'
        ? getAdminEmotions(period).then((d) => active && setEmotionsData(d))
        : section === 'beliefs'
          ? getAdminBeliefs(period).then((d) => active && setBeliefsData(d))
          : getAdminPatterns(period).then((d) => active && setPatternsData(d));
    fetcher.finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => {
      active = false;
    };
  }, [section, period, detailRefreshKey]);

  async function handleStatusChange(feedbackId: string, status: FeedbackStatus) {
    const ok = await updateFeedbackStatus(feedbackId, status);
    if (ok) {
      setFeedback((prev) =>
        prev.map((f) => (f.id === feedbackId ? { ...f, status } : f))
      );
      const s = await getAdminStats();
      if (s) setStats(s);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const sectionTitles: Record<AdminSection, string> = {
    overview: t('admin.nav.overview'),
    emotions: t('admin.nav.emotions'),
    beliefs: t('admin.nav.beliefs'),
    patterns: t('admin.nav.patterns'),
    users: t('admin.nav.users'),
    feedback: t('admin.nav.feedback'),
    prompts: t('admin.nav.prompts'),
  };

  const initial = (profile?.full_name?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase();
  const displayName = profile?.full_name ?? user?.email ?? 'Admin';

  function handleNavClick(s: AdminSection) {
    setSection(s);
    setDrawerOpen(false);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--cam-bg-page)',
        zIndex: 50,
        fontFamily: 'Satoshi, -apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex',
        overflow: 'hidden',
        // Áreas seguras: o painel é fixo em toda a viewport (inset:0), então
        // precisa insetar o conteúdo pra não sumir atrás da Dynamic Island, dos
        // cantos arredondados e da barra inferior do iPhone. No desktop os insets
        // são 0 (sem efeito).
        boxSizing: 'border-box',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Sidebar — desktop */}
      <aside
        className="hidden md:flex"
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          backgroundColor: 'var(--cam-bg-card)',
          borderRight: `1px solid var(--cam-border-subtle)`,
          flexDirection: 'column',
          padding: '20px 16px',
        }}
      >
        <SidebarContent
          section={section}
          onNavClick={handleNavClick}
          onViewAsUser={() => navigate('/home')}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Sidebar — mobile (drawer) */}
      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 60,
            }}
          />
          <aside
            className="md:hidden"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: SIDEBAR_WIDTH,
              backgroundColor: 'var(--cam-bg-card)',
              padding: '20px 16px',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <SidebarContent
              section={section}
              onNavClick={handleNavClick}
              onViewAsUser={() => {
                navigate('/home');
                setDrawerOpen(false);
              }}
              onSignOut={handleSignOut}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header
          style={{
            backgroundColor: 'var(--cam-bg-card)',
            borderBottom: `1px solid var(--cam-border-subtle)`,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden"
            aria-label="Menu"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cam-text-primary)',
            }}
          >
            <Menu size={22} />
          </button>

          <h1
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--cam-text-primary)',
              margin: 0,
              letterSpacing: '-0.3px',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sectionTitles[section]}
          </h1>

          <button
            type="button"
            onClick={() => {
              void load(false);
              setDetailRefreshKey((k) => k + 1);
            }}
            disabled={refreshing || loading}
            aria-label={t('admin.refresh')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '38px',
              height: '38px',
              background: 'var(--cam-bg-tint)',
              border: 'none',
              borderRadius: '50%',
              cursor: refreshing || loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              color: 'var(--cam-text-primary)',
              flexShrink: 0,
            }}
          >
            {refreshing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>

          {/* Identidade do admin (sem ações — Ver como usuário/Sair ficam só na
              barra lateral, pra não duplicar). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px 4px 4px',
              background: 'var(--cam-bg-tint)',
              borderRadius: '9999px',
              flexShrink: 0,
              maxWidth: 220,
            }}
            title={displayName}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                backgroundColor: 'var(--cam-color-brand)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <span
              className="hidden sm:block"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--cam-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {displayName}
            </span>
          </div>
        </header>

        {/* Content */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px 40px 20px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {loading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '80px 20px',
                  gap: '12px',
                  color: 'var(--cam-text-secondary)',
                }}
              >
                <Loader2 size={20} className="animate-spin" />
                <span style={{ fontSize: '14px' }}>{t('common.loading')}</span>
              </div>
            )}

            {error && !loading && (
              <div
                role="alert"
                style={{
                  backgroundColor: 'var(--cam-bg-error-soft)',
                  color: 'var(--cam-text-error)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '20px',
                }}
              >
                {error}
              </div>
            )}

            {/* Filtro de período — só nas abas de detalhe */}
            {DETAIL_SECTIONS.includes(section) && (
              <PeriodFilter value={period} onChange={setPeriod} />
            )}

            {!loading && stats && section === 'overview' && (
              <OverviewView stats={stats} onNavigate={setSection} />
            )}
            {section === 'emotions' && (
              <EmotionsView data={emotionsData} loading={detailLoading} />
            )}
            {section === 'beliefs' && (
              <BeliefsView data={beliefsData} loading={detailLoading} />
            )}
            {section === 'patterns' && (
              <PatternsView data={patternsData} loading={detailLoading} />
            )}
            {!loading && stats && section === 'feedback' && (
              <FeedbackView
                feedback={feedback}
                stats={stats}
                currentFilter={feedbackFilter}
                onFilterChange={setFeedbackFilter}
                onStatusChange={handleStatusChange}
                lang={i18n.language}
              />
            )}
            {!loading && section === 'users' && (
              <UsersView users={users} loading={usersLoading} lang={i18n.language} />
            )}
            {section === 'prompts' && <PromptsView />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function SidebarContent({
  section,
  onNavClick,
  onViewAsUser,
  onSignOut,
  onClose,
}: {
  section: AdminSection;
  onNavClick: (s: AdminSection) => void;
  onViewAsUser: () => void;
  onSignOut: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const navItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: t('admin.nav.overview'), icon: LayoutDashboard },
    { id: 'emotions', label: t('admin.nav.emotions'), icon: Heart },
    { id: 'beliefs', label: t('admin.nav.beliefs'), icon: Brain },
    { id: 'patterns', label: t('admin.nav.patterns'), icon: TrendingUp },
    { id: 'users', label: t('admin.nav.users'), icon: Users },
    { id: 'feedback', label: t('admin.nav.feedback'), icon: MessageSquare },
    { id: 'prompts', label: t('admin.nav.prompts'), icon: Sparkles },
  ];

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '6px 10px 18px 10px',
          borderBottom: `1px solid var(--cam-border-subtle)`,
          marginBottom: '12px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '10px',
              backgroundColor: 'var(--cam-color-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={16} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--cam-text-primary)',
                lineHeight: 1.1,
              }}
            >
              Caminare
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--cam-text-brand)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                fontWeight: 700,
                marginTop: '2px',
              }}
            >
              {t('admin.adminBadge')}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              color: 'var(--cam-text-secondary)',
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {navItems.map((item) => {
          const active = section === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavClick(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '12px',
                background: active ? 'var(--cam-bg-muted)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--cam-text-brand)' : 'var(--cam-text-primary)',
                textAlign: 'left',
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          paddingTop: '16px',
          marginTop: '16px',
          borderTop: `1px solid var(--cam-border-subtle)`,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={onViewAsUser}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--cam-text-secondary)',
            textAlign: 'left',
          }}
        >
          <ArrowLeft size={18} />
          {t('admin.menu.viewAsUser')}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--cam-text-error)',
            textAlign: 'left',
          }}
        >
          <LogOut size={18} />
          {t('admin.menu.signOut')}
        </button>
      </div>
    </>
  );
}

// Cores das proporções/badges de validação (reaproveitadas em todas as abas).
const STATUS_COLOR: Record<'confirmed' | 'rejected' | 'edited' | 'ignored' | 'pending', string> = {
  confirmed: 'var(--cam-color-accent)',
  rejected: 'var(--cam-color-error)',
  edited: 'var(--cam-text-warning)',
  ignored: 'var(--cam-text-secondary)',
  pending: 'var(--cam-text-secondary)',
};

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewView({
  stats,
  onNavigate,
}: {
  stats: AdminStats;
  onNavigate: (s: AdminSection) => void;
}) {
  const { t } = useTranslation();

  // Taxa de validação = aceitas (validadas + editadas) sobre o total sugerido.
  // Editar conta como aceitar (o usuário manteve a sugestão, só ajustou o texto).
  const suggested = stats.emotions_total + stats.beliefs_total + stats.patterns_total;
  const accepted =
    stats.emotions_confirmed + stats.beliefs_confirmed + stats.patterns_confirmed +
    stats.emotions_adjusted + stats.beliefs_adjusted + stats.patterns_adjusted;
  const validationRate = suggested > 0 ? Math.round((accepted / suggested) * 100) : 0;

  const quality: {
    section: AdminSection;
    label: string;
    total: number;
    confirmed: number;
    rejected: number;
    edited: number;
    ignored: number;
  }[] = [
    {
      section: 'emotions',
      label: t('admin.sections.emotions'),
      total: stats.emotions_total,
      confirmed: stats.emotions_confirmed,
      rejected: stats.emotions_rejected,
      edited: stats.emotions_adjusted,
      ignored: stats.emotions_ignored,
    },
    {
      section: 'beliefs',
      label: t('admin.sections.beliefs'),
      total: stats.beliefs_total,
      confirmed: stats.beliefs_confirmed,
      rejected: stats.beliefs_rejected,
      edited: stats.beliefs_adjusted,
      ignored: stats.beliefs_ignored,
    },
    {
      section: 'patterns',
      label: t('admin.sections.patterns'),
      total: stats.patterns_total,
      confirmed: stats.patterns_confirmed,
      rejected: stats.patterns_rejected,
      edited: stats.patterns_adjusted,
      ignored: stats.patterns_ignored,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* KPIs-herói */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}
      >
        <KpiCard label={t('admin.overview.kpiUsers')} value={stats.total_users} />
        <KpiCard label={t('admin.overview.kpiEntries')} value={stats.total_entries} />
        <KpiCard
          label={t('admin.overview.kpiAvgWeekly')}
          value={formatDecimal(stats.avg_weekly_entries_per_user)}
        />
        <KpiCard
          label={t('admin.overview.kpiValidation')}
          value={`${validationRate}%`}
          accent
        />
      </div>

      {/* Qualidade da IA */}
      <section>
        <SubHeading>{t('admin.overview.qualityTitle')}</SubHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {quality.map((q) => (
            <div
              key={q.section}
              style={{
                backgroundColor: 'var(--cam-bg-card)',
                borderRadius: '16px',
                padding: '16px 18px',
                boxShadow: 'var(--cam-shadow-card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 500,
                    color: 'var(--cam-text-primary)',
                  }}
                >
                  {q.label}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(q.section)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--cam-text-brand)',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {t('admin.overview.viewDetails')}
                  <ChevronRight size={15} />
                </button>
              </div>
              <ProportionBar
                total={q.total}
                confirmed={q.confirmed}
                rejected={q.rejected}
                edited={q.edited}
                ignored={q.ignored}
              />
            </div>
          ))}
        </div>
        <ProportionLegend />
      </section>

      {/* Assinaturas e lojas — números reais */}
      <section>
        <h2
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--cam-text-primary)',
            margin: '0 0 12px 4px',
          }}
        >
          {t('admin.overview.subscriptionsTitle')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
          }}
        >
          <KpiCard label={t('admin.overview.subsTrials')} value={stats.users_trial} />
          <KpiCard label={t('admin.overview.subsActive')} value={stats.users_active} accent />
          <KpiCard label={t('admin.overview.subsMonthly')} value={stats.subs_monthly_active} />
          <KpiCard label={t('admin.overview.subsAnnual')} value={stats.subs_annual_active} />
          <KpiCard label={t('admin.overview.subsApple')} value={stats.users_apple} />
          <KpiCard label={t('admin.overview.subsGoogle')} value={stats.users_google} />
        </div>
      </section>
    </div>
  );
}

// ── Componentes compartilhados das abas ────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: 'var(--cam-bg-card)',
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: 'var(--cam-shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: '32px',
          fontWeight: 700,
          color: accent ? 'var(--cam-text-accent)' : 'var(--cam-text-primary)',
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--cam-text-secondary)',
          fontWeight: 500,
          marginTop: '6px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--cam-text-secondary)',
        margin: '0 0 12px 4px',
      }}
    >
      {children}
    </h2>
  );
}

// Barra de proporção empilhada (validadas/rejeitadas/editadas/ignoradas). O
// espaço restante até o total = itens ainda pendentes (track de fundo).
function ProportionBar({
  total,
  confirmed,
  rejected,
  edited,
  ignored,
}: {
  total: number;
  confirmed: number;
  rejected: number;
  edited: number;
  ignored: number;
}) {
  const base = total > 0 ? total : 1;
  const segs: { value: number; color: string }[] = [
    { value: confirmed, color: STATUS_COLOR.confirmed },
    { value: edited, color: STATUS_COLOR.edited },
    { value: ignored, color: STATUS_COLOR.ignored },
    { value: rejected, color: STATUS_COLOR.rejected },
  ];
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '10px',
        borderRadius: '9999px',
        overflow: 'hidden',
        backgroundColor: 'var(--cam-bg-muted)',
      }}
    >
      {segs.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            style={{
              width: `${(s.value / base) * 100}%`,
              backgroundColor: s.color,
            }}
          />
        ) : null
      )}
    </div>
  );
}

function ProportionLegend() {
  const { t } = useTranslation();
  const items: { key: 'confirmed' | 'edited' | 'ignored' | 'rejected'; label: string }[] = [
    { key: 'confirmed', label: t('admin.metrics.validated') },
    { key: 'edited', label: t('admin.metrics.edited') },
    { key: 'ignored', label: t('admin.metrics.ignored') },
    { key: 'rejected', label: t('admin.metrics.rejected') },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '14px',
        marginTop: '12px',
        marginLeft: '4px',
      }}
    >
      {items.map((it) => (
        <span
          key={it.key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--cam-text-secondary)',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '3px',
              backgroundColor: STATUS_COLOR[it.key],
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Cards de quantidade por status + taxa de validação. Reutilizado nas 3 abas.
function StatusCards({
  total,
  confirmed,
  rejected,
  edited,
  ignored,
}: {
  total: number;
  confirmed: number;
  rejected: number;
  edited: number;
  ignored: number;
}) {
  const { t } = useTranslation();
  // "Pendente" no banco = o usuário não validou nem rejeitou, ou seja, ignorou.
  // Não existe categoria "pendente": somamos essas às ignoradas. Assim os cards
  // fecham com o total (validadas + editadas + rejeitadas + ignoradas = sugeridas).
  const ignoredTotal = Math.max(0, total - confirmed - rejected - edited);
  // Taxa de validação = aceitas (validadas + editadas) sobre o total sugerido.
  const rate = total > 0 ? Math.round(((confirmed + edited) / total) * 100) : 0;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '28px',
      }}
    >
      <MetricCard label={t('admin.metrics.suggested')} value={total} />
      <MetricCard label={t('admin.metrics.validated')} value={confirmed} accent="accent" />
      <MetricCard label={t('admin.metrics.edited')} value={edited} accent="warning" />
      <MetricCard label={t('admin.metrics.rejected')} value={rejected} accent="error" />
      <MetricCard label={t('admin.metrics.ignored')} value={ignoredTotal} />
      <MetricCard label={t('admin.detail.validationRate')} value={`${rate}%`} accent="accent" />
    </div>
  );
}

// Ranking com barras proporcionais ao maior valor (mais frequentes / intensidade).
function RankingBars({ items }: { items: { label: string; count: number }[] }) {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0) || 1;
  return (
    <div
      style={{
        backgroundColor: 'var(--cam-bg-card)',
        borderRadius: '16px',
        padding: '16px 18px',
        boxShadow: 'var(--cam-shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {items.map((it, i) => (
        <div key={i}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: 'var(--cam-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {it.label}
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--cam-text-secondary)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {it.count}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '9999px',
              backgroundColor: 'var(--cam-bg-muted)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(it.count / max) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--cam-color-brand)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ validation }: { validation: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; color: string }> = {
    confirmed: { label: t('admin.metrics.validated'), color: STATUS_COLOR.confirmed },
    rejected: { label: t('admin.metrics.rejected'), color: STATUS_COLOR.rejected },
    edited: { label: t('admin.metrics.edited'), color: STATUS_COLOR.edited },
    ignored: { label: t('admin.metrics.ignored'), color: STATUS_COLOR.ignored },
    // "Pendente" (não validada nem rejeitada) é tratada como ignorada.
    pending: { label: t('admin.metrics.ignored'), color: STATUS_COLOR.ignored },
  };
  const cfg = map[validation] ?? map.ignored;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--cam-text-secondary)',
        flexShrink: 0,
      }}
    >
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}

function DetailLoading() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '10px',
        color: 'var(--cam-text-secondary)',
      }}
    >
      <Loader2 size={18} className="animate-spin" />
      <span style={{ fontSize: '14px' }}>{t('common.loading')}</span>
    </div>
  );
}

function DetailEmpty() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        backgroundColor: 'var(--cam-bg-card)',
        borderRadius: '16px',
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--cam-text-secondary)',
        fontSize: '14px',
        boxShadow: 'var(--cam-shadow-card)',
      }}
    >
      {t('admin.detail.empty')}
    </div>
  );
}

// Status selecionável nas abas de detalhe ('all' = todos). "Ignoradas" inclui as
// pendentes (não validadas nem rejeitadas), que na prática são ignoradas.
type DetailStatus = 'all' | 'confirmed' | 'edited' | 'rejected' | 'ignored';

// Filtro de status (pills com a contagem em cada). Reutilizado nas 3 abas.
function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: DetailStatus;
  onChange: (s: DetailStatus) => void;
  counts: Record<DetailStatus, number>;
}) {
  const { t } = useTranslation();
  const opts: { value: DetailStatus; label: string }[] = [
    { value: 'all', label: t('admin.detail.statusAll') },
    { value: 'confirmed', label: t('admin.metrics.validated') },
    { value: 'edited', label: t('admin.metrics.edited') },
    { value: 'rejected', label: t('admin.metrics.rejected') },
    { value: 'ignored', label: t('admin.metrics.ignored') },
  ];
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {opts.map((o) => {
        const active = value === o.value;
        const dot = o.value !== 'all' ? STATUS_COLOR[o.value] : null;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 13px',
              borderRadius: '9999px',
              border: active ? 'none' : `1.5px solid var(--cam-border)`,
              backgroundColor: active ? 'var(--cam-color-brand)' : 'var(--cam-bg-card)',
              color: active ? '#FFFFFF' : 'var(--cam-text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {dot && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: active ? '#FFFFFF' : dot,
                }}
              />
            )}
            {o.label} · {counts[o.value]}
          </button>
        );
      })}
    </div>
  );
}

// ── Emoções ─────────────────────────────────────────────────────────────────

function EmotionsView({
  data,
  loading,
}: {
  data: AdminEmotions | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DetailStatus>('all');
  if (loading && !data) return <DetailLoading />;
  if (!data) return <DetailEmpty />;

  const counts: Record<DetailStatus, number> = {
    all: data.total,
    confirmed: data.confirmed,
    edited: data.edited,
    rejected: data.rejected,
    // Ignoradas engloba as pendentes (não validadas nem rejeitadas).
    ignored: Math.max(0, data.total - data.confirmed - data.rejected - data.edited),
  };

  // Ranking de nomes dentro do status escolhido. 'all' soma todos os status
  // (equivalente ao top geral).
  let ranking: { label: string; count: number }[];
  if (status === 'all') {
    const byName = new Map<string, number>();
    for (const it of data.items) byName.set(it.name, (byName.get(it.name) ?? 0) + it.count);
    ranking = [...byName.entries()].map(([label, count]) => ({ label, count }));
  } else {
    ranking = data.items
      .filter(
        (it) =>
          it.validation === status ||
          (status === 'ignored' && it.validation === 'pending')
      )
      .map((it) => ({ label: it.name, count: it.count }));
  }
  ranking = ranking.sort((a, b) => b.count - a.count).slice(0, 30);

  const intensity = [
    { label: t('admin.emotionsTab.subtle'), count: data.by_intensity.subtle },
    { label: t('admin.emotionsTab.moderate'), count: data.by_intensity.moderate },
    {
      label: t('admin.emotionsTab.strong'),
      count: data.by_intensity.strong + data.by_intensity.very_strong,
    },
  ];

  return (
    <div>
      <StatusCards
        total={data.total}
        confirmed={data.confirmed}
        rejected={data.rejected}
        edited={data.edited}
        ignored={data.ignored}
      />

      <StatusFilter value={status} onChange={setStatus} counts={counts} />

      <section style={{ marginBottom: '28px' }}>
        <SubHeading>{t('admin.emotionsTab.mostFrequent')}</SubHeading>
        {ranking.length === 0 ? <DetailEmpty /> : <RankingBars items={ranking} />}
      </section>

      <section>
        <SubHeading>{t('admin.emotionsTab.byIntensity')}</SubHeading>
        <RankingBars items={intensity} />
      </section>
    </div>
  );
}

// ── Crenças ─────────────────────────────────────────────────────────────────

function BeliefsView({
  data,
  loading,
}: {
  data: AdminBeliefs | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DetailStatus>('all');
  if (loading && !data) return <DetailLoading />;
  if (!data) return <DetailEmpty />;

  const counts: Record<DetailStatus, number> = {
    all: data.total,
    confirmed: data.confirmed,
    edited: data.edited,
    rejected: data.rejected,
    // Ignoradas engloba as pendentes (não validadas nem rejeitadas).
    ignored: Math.max(0, data.total - data.confirmed - data.rejected - data.edited),
  };
  const filtered =
    status === 'all'
      ? data.items
      : data.items.filter(
          (b) =>
            b.validation === status ||
            (status === 'ignored' && b.validation === 'pending')
        );

  return (
    <div>
      <StatusCards
        total={data.total}
        confirmed={data.confirmed}
        rejected={data.rejected}
        edited={data.edited}
        ignored={data.ignored}
      />

      <StatusFilter value={status} onChange={setStatus} counts={counts} />

      {filtered.length === 0 ? (
        <DetailEmpty />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((b, i) => {
            const showDiff =
              b.validation === 'edited' &&
              !!b.content_original &&
              b.content_original !== b.content;
            return (
              <div
                key={i}
                style={{
                  backgroundColor: 'var(--cam-bg-card)',
                  borderRadius: '16px',
                  padding: '16px 18px',
                  boxShadow: 'var(--cam-shadow-card)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  {showDiff ? (
                    <div style={{ marginBottom: '8px' }}>
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--cam-text-secondary)',
                          textDecoration: 'line-through',
                          lineHeight: 1.4,
                          margin: '0 0 4px 0',
                        }}
                      >
                        {b.content_original}
                      </p>
                      <p
                        style={{
                          fontSize: '15px',
                          color: 'var(--cam-text-primary)',
                          fontWeight: 500,
                          lineHeight: 1.4,
                          margin: 0,
                        }}
                      >
                        {b.content}
                      </p>
                    </div>
                  ) : (
                    <p
                      style={{
                        fontSize: '15px',
                        color: 'var(--cam-text-primary)',
                        lineHeight: 1.4,
                        margin: '0 0 8px 0',
                      }}
                    >
                      {b.content}
                    </p>
                  )}
                  <StatusBadge validation={b.validation} />
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--cam-text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {b.occurrence_count}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--cam-text-secondary)' }}>
                    {t('admin.detail.occurrences')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Padrões ─────────────────────────────────────────────────────────────────

function PatternsView({
  data,
  loading,
}: {
  data: AdminPatternsData | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DetailStatus>('all');
  if (loading && !data) return <DetailLoading />;
  if (!data) return <DetailEmpty />;

  const counts: Record<DetailStatus, number> = {
    all: data.total,
    confirmed: data.confirmed,
    edited: data.edited,
    rejected: data.rejected,
    // Ignoradas engloba as pendentes (não validadas nem rejeitadas).
    ignored: Math.max(0, data.total - data.confirmed - data.rejected - data.edited),
  };
  const filtered =
    status === 'all'
      ? data.list
      : data.list.filter(
          (p) =>
            p.validation === status ||
            (status === 'ignored' && p.validation === 'pending')
        );

  return (
    <div>
      <StatusCards
        total={data.total}
        confirmed={data.confirmed}
        rejected={data.rejected}
        edited={data.edited}
        ignored={data.ignored}
      />

      <StatusFilter value={status} onChange={setStatus} counts={counts} />

      <section>
        <SubHeading>{t('admin.patternsTab.detected')}</SubHeading>
        {filtered.length === 0 ? (
          <DetailEmpty />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((p, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: 'var(--cam-bg-card)',
                  borderRadius: '16px',
                  padding: '16px 18px',
                  boxShadow: 'var(--cam-shadow-card)',
                }}
              >
                <p
                  style={{
                    fontSize: '15px',
                    color: 'var(--cam-text-primary)',
                    lineHeight: 1.45,
                    margin: '0 0 12px 0',
                  }}
                >
                  {p.description}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    fontSize: '12px',
                    color: 'var(--cam-text-secondary)',
                  }}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.occurrence_count} {t('admin.detail.occurrences')}
                  </span>
                  <span>
                    {t('admin.patternsTab.severity')}: {p.severity ?? '—'}
                  </span>
                  <StatusBadge validation={p.validation} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Filtro de período ──────────────────────────────────────────────────────

function PeriodFilter({
  value,
  onChange,
}: {
  value: AdminPeriod;
  onChange: (p: AdminPeriod) => void;
}) {
  const { t } = useTranslation();
  const opts: { value: AdminPeriod; label: string }[] = [
    { value: '7days', label: t('admin.period.d7') },
    { value: '30days', label: t('admin.period.d30') },
    { value: '90days', label: t('admin.period.d90') },
    { value: 'all', label: t('admin.period.all') },
  ];
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '7px 14px',
              borderRadius: '9999px',
              border: active ? 'none' : `1.5px solid var(--cam-border)`,
              backgroundColor: active ? 'var(--cam-color-brand)' : 'var(--cam-bg-card)',
              color: active ? '#FFFFFF' : 'var(--cam-text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
  muted,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: 'accent' | 'error' | 'warning';
  muted?: boolean;
}) {
  const valueColor =
    accent === 'accent'
      ? 'var(--cam-text-accent)'
      : accent === 'error'
        ? 'var(--cam-text-error)'
        : accent === 'warning'
          ? 'var(--cam-text-warning)'
          : 'var(--cam-text-primary)';

  return (
    <div
      style={{
        backgroundColor: 'var(--cam-bg-card)',
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: 'var(--cam-shadow-card)',
        opacity: muted ? 0.72 : 1,
      }}
    >
      <div
        style={{
          fontSize: '12px',
          color: 'var(--cam-text-secondary)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: 700,
          color: valueColor,
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--cam-text-secondary)',
            marginTop: '6px',
            fontStyle: 'italic',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────────────

function FeedbackView({
  feedback,
  stats,
  currentFilter,
  onFilterChange,
  onStatusChange,
  lang,
}: {
  feedback: FeedbackItem[];
  stats: AdminStats;
  currentFilter: FeedbackFilter;
  onFilterChange: (f: FeedbackFilter) => void;
  onStatusChange: (id: string, status: FeedbackStatus) => void;
  lang: string;
}) {
  const { t } = useTranslation();

  const filters: { value: FeedbackFilter; label: string; count: number }[] = [
    { value: 'all', label: t('admin.feedback.filterAll'), count: stats.feedback_total },
    { value: 'new', label: t('admin.feedback.filterNew'), count: stats.feedback_new },
    { value: 'read', label: t('admin.feedback.filterRead'), count: stats.feedback_read },
    {
      value: 'resolved',
      label: t('admin.feedback.filterResolved'),
      count: stats.feedback_resolved,
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilterChange(f.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '9999px',
              border:
                currentFilter === f.value ? 'none' : `1.5px solid var(--cam-border)`,
              backgroundColor:
                currentFilter === f.value
                  ? 'var(--cam-color-brand)'
                  : 'var(--cam-bg-card)',
              color:
                currentFilter === f.value ? '#FFFFFF' : 'var(--cam-text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {f.label} · {f.count}
          </button>
        ))}
      </div>

      {feedback.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--cam-bg-card)',
            borderRadius: '16px',
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--cam-text-secondary)',
            fontSize: '14px',
            boxShadow: 'var(--cam-shadow-card)',
          }}
        >
          {t('admin.feedback.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {feedback.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackRow({
  item,
  onStatusChange,
  lang,
}: {
  item: FeedbackItem;
  onStatusChange: (id: string, status: FeedbackStatus) => void;
  lang: string;
}) {
  const { t } = useTranslation();
  const { date, time } = formatDate(item.created_at, lang);
  const statusConfig: Record<
    FeedbackStatus,
    { color: string; bg: string; label: string; Icon: typeof Check }
  > = {
    new: {
      color: 'var(--cam-text-brand)',
      bg: 'var(--cam-bg-muted)',
      label: t('admin.feedback.statusNew'),
      Icon: CircleDot,
    },
    read: {
      color: 'var(--cam-text-warning)',
      bg: 'var(--cam-bg-warning-soft)',
      label: t('admin.feedback.statusRead'),
      Icon: Eye,
    },
    resolved: {
      color: 'var(--cam-text-accent)',
      bg: 'var(--cam-bg-accent-soft)',
      label: t('admin.feedback.statusResolved'),
      Icon: Check,
    },
  };
  const cfg = statusConfig[item.status];
  const Icon = cfg.Icon;

  return (
    <div
      style={{
        backgroundColor: 'var(--cam-bg-card)',
        borderRadius: '16px',
        padding: '16px 18px',
        boxShadow: 'var(--cam-shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--cam-text-primary)',
              marginBottom: '2px',
            }}
          >
            {item.user_name || t('admin.feedback.noName')}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--cam-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.user_email || '—'} · {date} · {time}
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            backgroundColor: cfg.bg,
            color: cfg.color,
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}
        >
          <Icon size={12} strokeWidth={2.5} />
          {cfg.label}
        </div>
      </div>

      <p
        style={{
          fontSize: '14px',
          color: 'var(--cam-text-primary)',
          lineHeight: 1.5,
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {item.message}
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['new', 'read', 'resolved'] as FeedbackStatus[])
          .filter((s) => s !== item.status)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(item.id, s)}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid var(--cam-border)`,
                backgroundColor: 'transparent',
                color: 'var(--cam-text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('admin.feedback.markAs')} {statusConfig[s].label.toLowerCase()}
            </button>
          ))}
      </div>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersView({
  users,
  loading,
  lang,
}: {
  users: AdminUser[] | null;
  loading: boolean;
  lang: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  if (loading || users === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          gap: '10px',
          color: 'var(--cam-text-secondary)',
        }}
      >
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: '14px' }}>{t('common.loading')}</span>
      </div>
    );
  }

  const filtered = search.trim()
    ? users.filter((u) => {
        const term = search.toLowerCase();
        return (
          (u.email ?? '').toLowerCase().includes(term) ||
          (u.full_name ?? '').toLowerCase().includes(term)
        );
      })
    : users;

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.users.searchPlaceholder')}
          style={{
            width: '100%',
            height: '44px',
            padding: '0 16px',
            borderRadius: '12px',
            border: `1px solid var(--cam-border-subtle)`,
            backgroundColor: 'var(--cam-bg-card)',
            fontSize: '14px',
            color: 'var(--cam-text-primary)',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Count */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--cam-text-secondary)',
          marginBottom: '12px',
          fontWeight: 600,
        }}
      >
        {t('admin.users.count', { count: filtered.length })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--cam-bg-card)',
            borderRadius: '16px',
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--cam-text-secondary)',
            fontSize: '14px',
            boxShadow: 'var(--cam-shadow-card)',
          }}
        >
          {search.trim()
            ? t('admin.users.emptySearch')
            : t('admin.users.emptyAll')}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--cam-bg-card)',
            borderRadius: '16px',
            boxShadow: 'var(--cam-shadow-card)',
            overflow: 'hidden',
          }}
        >
          {filtered.map((u, i) => (
            <UserRow
              key={u.id}
              user={u}
              lang={lang}
              isLast={i === filtered.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  lang,
  isLast,
}: {
  user: AdminUser;
  lang: string;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const initial = (user.full_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase();
  const signupDate = new Date(user.created_at).toLocaleDateString(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 18px',
        borderBottom: isLast ? 'none' : `1px solid var(--cam-border-subtle)`,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          backgroundColor: 'var(--cam-bg-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--cam-text-brand)',
        }}
      >
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--cam-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {user.full_name || t('admin.feedback.noName')}
          </span>
          {user.is_admin && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#FFFFFF',
                backgroundColor: 'var(--cam-color-brand)',
                padding: '2px 6px',
                borderRadius: '9999px',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                flexShrink: 0,
              }}
            >
              Admin
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--cam-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.email || '—'}
        </div>
      </div>
      <div
        style={{
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--cam-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {user.entries_count}
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--cam-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            fontWeight: 600,
            marginTop: '1px',
          }}
        >
          {t('admin.users.entries')}
        </div>
      </div>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--cam-text-secondary)',
          minWidth: '70px',
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {signupDate}
      </div>
    </div>
  );
}

function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(1).replace('.', ',');
}
