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

type DashboardTab = 'home' | 'accounts' | 'import';

export function AuthenticatedDashboard({
  onSignOut,
  userEmail
}: AuthenticatedDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  function handleSelectTab(tab: DashboardTab) {
    setActiveTab(tab);

    if (tab === 'home') {
      void loadDashboard();
    }
  }

  let tabContent = (
    <HomePanel
      error={error}
      isLoading={isLoading}
      summary={summary}
      onCreateAccount={() => handleSelectTab('accounts')}
      onImportMovements={() => handleSelectTab('import')}
      onRetry={() => void loadDashboard()}
    />
  );

  if (activeTab === 'accounts') {
    tabContent = <FinancialAccountsPanel />;
  }

  if (activeTab === 'import') {
    tabContent = <CsvImportPanel onBack={() => handleSelectTab('home')} />;
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
      <header className="dashboard-header">
        <BrandMark />
        <div className="dashboard-session">
          {userEmail ? <span>Sesion Supabase activa: {userEmail}</span> : null}
          {onSignOut ? (
            <button className="text-link" onClick={onSignOut} type="button">
              Salir
            </button>
          ) : null}
        </div>
      </header>

      {tabContent}

      <nav className="mobile-tab-bar" aria-label="Navegacion">
        <TabButton
          activeTab={activeTab}
          label="Inicio"
          tab="home"
          onSelect={handleSelectTab}
        />
        <TabButton
          activeTab={activeTab}
          label="Cuentas"
          tab="accounts"
          onSelect={handleSelectTab}
        />
        <TabButton
          activeTab={activeTab}
          label="Importar"
          tab="import"
          onSelect={handleSelectTab}
        />
      </nav>
    </ExperienceFrame>
  );
}

type TabButtonProps = {
  activeTab: DashboardTab;
  label: string;
  tab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
};

function TabButton({ activeTab, label, onSelect, tab }: TabButtonProps) {
  const isActive = activeTab === tab;

  return (
    <button
      className={
        isActive
          ? 'mobile-tab-bar__item mobile-tab-bar__item--active'
          : 'mobile-tab-bar__item'
      }
      onClick={() => onSelect(tab)}
      type="button"
    >
      {label}
    </button>
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
