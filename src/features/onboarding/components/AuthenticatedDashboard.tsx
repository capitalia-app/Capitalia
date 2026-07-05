import { useEffect, useState } from 'react';

import { CsvImportPanel } from '@/features/finance/components/CsvImportPanel';
import { FinancialAccountsPanel } from '@/features/finance/components/FinancialAccountsPanel';
import {
  getDashboardSummary,
  type DashboardSummary
} from '@/features/finance/lib/dashboard';
import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type AuthenticatedDashboardProps = {
  onSignOut?: () => void;
  userEmail?: string | null;
};

type AppSection =
  | 'dashboard'
  | 'accounts'
  | 'import'
  | 'movements'
  | 'categories'
  | 'assets'
  | 'goals'
  | 'settings';

type NavigationItem = {
  section: AppSection;
  label: string;
  detail: string;
};

const navigationItems = [
  {
    section: 'dashboard',
    label: 'Dashboard',
    detail: 'Resumen real'
  },
  {
    section: 'accounts',
    label: 'Cuentas',
    detail: 'Estructura financiera'
  },
  {
    section: 'import',
    label: 'Importar movimientos',
    detail: 'Excel o CSV bancario'
  },
  {
    section: 'movements',
    label: 'Movimientos',
    detail: 'Actividad real'
  },
  {
    section: 'categories',
    label: 'Categorias',
    detail: 'Reglas proximamente'
  },
  {
    section: 'assets',
    label: 'Activos',
    detail: 'Patrimonio avanzado'
  },
  {
    section: 'goals',
    label: 'Objetivos',
    detail: 'Plan financiero'
  },
  {
    section: 'settings',
    label: 'Ajustes',
    detail: 'Cuenta y seguridad'
  }
] satisfies NavigationItem[];

export function AuthenticatedDashboard({
  onSignOut,
  userEmail
}: AuthenticatedDashboardProps) {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  function handleSelectSection(section: AppSection) {
    setActiveSection(section);
    setIsMenuOpen(false);

    if (section === 'dashboard' || section === 'movements') {
      void loadDashboard();
    }
  }

  let sectionContent = (
    <HomePanel
      error={error}
      isLoading={isLoading}
      summary={summary}
      onCreateAccount={() => handleSelectSection('accounts')}
      onImportMovements={() => handleSelectSection('import')}
      onRetry={() => void loadDashboard()}
    />
  );

  if (activeSection === 'accounts') {
    sectionContent = <FinancialAccountsPanel />;
  }

  if (activeSection === 'import') {
    sectionContent = <CsvImportPanel onBack={() => handleSelectSection('dashboard')} />;
  }

  if (activeSection === 'movements') {
    sectionContent = (
      <MovementsPanel
        error={error}
        isLoading={isLoading}
        summary={summary}
        onImportMovements={() => handleSelectSection('import')}
        onRetry={() => void loadDashboard()}
      />
    );
  }

  if (activeSection === 'categories') {
    sectionContent = (
      <EmptySection
        eyebrow="Categorias"
        title="Sin categorias configuradas"
        copy="Las categorias se activaran cuando conectemos reglas reales sobre tus movimientos."
      />
    );
  }

  if (activeSection === 'assets') {
    sectionContent = (
      <EmptySection
        eyebrow="Activos"
        title="Sin activos avanzados"
        copy="Las posiciones, inmuebles y otros activos llegaran en una fase posterior con datos reales."
      />
    );
  }

  if (activeSection === 'goals') {
    sectionContent = (
      <EmptySection
        eyebrow="Objetivos"
        title="Sin objetivos creados"
        copy="Aqui apareceran tus objetivos financieros cuando exista el flujo real para crearlos."
      />
    );
  }

  if (activeSection === 'settings') {
    sectionContent = (
      <EmptySection
        eyebrow="Ajustes"
        title="Ajustes pendientes"
        copy="La gestion de cuenta, preferencias y seguridad se incorporara cuando exista el flujo real."
      />
    );
  }

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);

    try {
      setSummary(await getDashboardSummary());
    } catch (dashboardError) {
      setError(getErrorMessage(dashboardError));
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ExperienceFrame className="dashboard-screen">
      <header className="app-header">
        <BrandMark />
        <div className="dashboard-session">
          {userEmail ? <span>Sesion activa: {userEmail}</span> : null}
        </div>
        <button
          aria-expanded={isMenuOpen}
          aria-label="Abrir menu"
          className="hamburger-button"
          onClick={() => setIsMenuOpen(true)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <NavigationDrawer
        activeSection={activeSection}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onSelect={handleSelectSection}
        onSignOut={onSignOut}
        userEmail={userEmail}
      />

      {sectionContent}
    </ExperienceFrame>
  );
}

type NavigationDrawerProps = {
  activeSection: AppSection;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (section: AppSection) => void;
  onSignOut?: () => void;
  userEmail?: string | null;
};

function NavigationDrawer({
  activeSection,
  isOpen,
  onClose,
  onSelect,
  onSignOut,
  userEmail
}: NavigationDrawerProps) {
  return (
    <>
      <button
        aria-label="Cerrar menu"
        className={isOpen ? 'drawer-backdrop drawer-backdrop--open' : 'drawer-backdrop'}
        onClick={onClose}
        type="button"
      />
      <aside
        aria-hidden={!isOpen}
        className={isOpen ? 'app-drawer app-drawer--open' : 'app-drawer'}
      >
        <div className="drawer-heading">
          <BrandMark />
          <button
            aria-label="Cerrar menu"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Secciones de Capitalia">
          {navigationItems.map((item) => (
            <button
              className={
                activeSection === item.section
                  ? 'drawer-nav__item drawer-nav__item--active'
                  : 'drawer-nav__item'
              }
              key={item.section}
              onClick={() => onSelect(item.section)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </nav>

        <div className="drawer-footer">
          {userEmail ? <span>{userEmail}</span> : null}
          {onSignOut ? (
            <button className="text-link" onClick={onSignOut} type="button">
              Cerrar sesion
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}

type HomePanelProps = {
  error: string | null;
  isLoading: boolean;
  summary: DashboardSummary | null;
  onCreateAccount: () => void;
  onImportMovements: () => void;
  onRetry: () => void;
};

function HomePanel({
  error,
  isLoading,
  onCreateAccount,
  onImportMovements,
  onRetry,
  summary
}: HomePanelProps) {
  if (isLoading) {
    return <p className="panel-status">Cargando datos reales...</p>;
  }

  if (error) {
    return (
      <section className="empty-state-card">
        <span>No se pudo cargar tu dashboard.</span>
        <p>{error}</p>
        <button className="text-link" onClick={onRetry} type="button">
          Reintentar
        </button>
      </section>
    );
  }

  if (!summary) {
    return null;
  }

  const hasAccounts = summary.accounts.length > 0;
  const hasTransactions = summary.recentTransactions.length > 0;

  return (
    <>
      <section className="dashboard-hero" aria-label="Resumen financiero">
        <p className="eyebrow">{summary.workspace.name}</p>
        <div>
          <span>Patrimonio real</span>
          <strong>{formatMoney(summary.netWorth, summary.currency)}</strong>
        </div>
        <p>Datos calculados desde tus cuentas y movimientos</p>
        <small>
          {hasTransactions
            ? `Balance mensual: ${formatMoney(summary.monthBalance, summary.currency)}`
            : 'Sin movimientos importados'}
        </small>
      </section>

      <section className="metric-grid" aria-label="Resumen mensual real">
        <MetricCard
          label="Patrimonio"
          value={formatMoney(summary.netWorth, summary.currency)}
        />
        <MetricCard
          label="Ingresos"
          value={formatMoney(summary.monthIncome, summary.currency)}
        />
        <MetricCard
          label="Gastos"
          value={formatMoney(summary.monthExpenses, summary.currency)}
        />
        <MetricCard
          label="Balance"
          value={formatMoney(summary.monthBalance, summary.currency)}
        />
      </section>

      {!hasAccounts ? (
        <section className="empty-state-card">
          <span>Importa tu primera cuenta</span>
          <p>Crea una cuenta financiera para empezar a construir tu dashboard real.</p>
          <div className="empty-state-actions">
            <button className="text-link" onClick={onCreateAccount} type="button">
              Crear cuenta
            </button>
            <button className="text-link" onClick={onImportMovements} type="button">
              Importar movimientos
            </button>
          </div>
        </section>
      ) : (
        <section className="account-list" aria-label="Saldos por cuenta">
          {summary.accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <div>
                <strong>{account.name}</strong>
                <span>Saldo real</span>
              </div>
              <div>
                <strong>{formatMoney(account.balance, account.currency)}</strong>
                <small>{account.currency}</small>
              </div>
            </article>
          ))}
        </section>
      )}

      <button className="import-entry-card" onClick={onImportMovements} type="button">
        <span>Importar movimientos</span>
        <strong>Excel o CSV bancario</strong>
        <small>
          {hasAccounts
            ? 'Sube tus movimientos reales para alimentar el dashboard.'
            : 'Primero crea una cuenta para poder importar movimientos.'}
        </small>
      </button>

      <section className="assets-panel" aria-label="Ultimos movimientos">
        <div className="section-heading">
          <p className="eyebrow">Actividad</p>
          <h2>Ultimos movimientos</h2>
          <span>{hasTransactions ? 'Datos reales' : 'Sin movimientos'}</span>
        </div>

        {hasTransactions ? (
          <div className="asset-list">
            {summary.recentTransactions.map((transaction) => (
              <article className="asset-row" key={transaction.id}>
                <div>
                  <strong>{transaction.description}</strong>
                  <span>{formatDate(transaction.occurredAt)}</span>
                </div>
                <div>
                  <strong>
                    {transaction.direction === 'inflow' ? '+' : '-'}
                    {formatMoney(transaction.amount, transaction.currency)}
                  </strong>
                  <small>{getTransactionLabel(transaction.transactionType)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state-card">
            <span>Sin movimientos</span>
            <p>Importa un Excel/CSV bancario para ver tu actividad reciente.</p>
          </div>
        )}
      </section>
    </>
  );
}

type MovementsPanelProps = {
  error: string | null;
  isLoading: boolean;
  summary: DashboardSummary | null;
  onImportMovements: () => void;
  onRetry: () => void;
};

function MovementsPanel({
  error,
  isLoading,
  onImportMovements,
  onRetry,
  summary
}: MovementsPanelProps) {
  if (isLoading) {
    return <p className="panel-status">Cargando movimientos...</p>;
  }

  if (error) {
    return (
      <section className="empty-state-card">
        <span>No se pudieron cargar los movimientos.</span>
        <p>{error}</p>
        <button className="text-link" onClick={onRetry} type="button">
          Reintentar
        </button>
      </section>
    );
  }

  const transactions = summary?.recentTransactions ?? [];

  return (
    <section className="assets-panel" aria-label="Movimientos">
      <div className="section-heading">
        <p className="eyebrow">Movimientos</p>
        <h2>Actividad real</h2>
        <span>{transactions.length > 0 ? 'Ultimos 10' : 'Sin movimientos'}</span>
      </div>

      {transactions.length > 0 ? (
        <div className="asset-list">
          {transactions.map((transaction) => (
            <article className="asset-row" key={transaction.id}>
              <div>
                <strong>{transaction.description}</strong>
                <span>{formatDate(transaction.occurredAt)}</span>
              </div>
              <div>
                <strong>
                  {transaction.direction === 'inflow' ? '+' : '-'}
                  {formatMoney(transaction.amount, transaction.currency)}
                </strong>
                <small>{getTransactionLabel(transaction.transactionType)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state-card">
          <span>Sin movimientos</span>
          <p>Importa movimientos reales para construir tu actividad financiera.</p>
          <button className="text-link" onClick={onImportMovements} type="button">
            Importar movimientos
          </button>
        </div>
      )}
    </section>
  );
}

type EmptySectionProps = {
  eyebrow: string;
  title: string;
  copy: string;
};

function EmptySection({ copy, eyebrow, title }: EmptySectionProps) {
  return (
    <section className="empty-section" aria-label={eyebrow}>
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <span>Datos reales pendientes</span>
      </div>
      <div className="empty-state-card">
        <span>{title}</span>
        <p>{copy}</p>
      </div>
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    currency,
    maximumFractionDigits: 2,
    style: 'currency'
  }).format(value);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(date));
}

function getTransactionLabel(type: string) {
  if (type === 'income') {
    return 'Ingreso';
  }

  if (type === 'transfer') {
    return 'Transferencia';
  }

  return 'Movimiento';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo cargar la informacion financiera.';
}
