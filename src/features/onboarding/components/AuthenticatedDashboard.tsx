import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { createPortal } from 'react-dom';

import { CsvImportPanel } from '@/features/finance/components/CsvImportPanel';
import {
  getAnnualControlSummary,
  monthLabels,
  type AnnualCellTarget,
  type AnnualControlSummary,
  type AnnualTableRow
} from '@/features/finance/lib/annualControl';
import {
  getCurrentWorkspace,
  type FinancialAccount,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import {
  deleteCategoryRule,
  deleteTransactionCategory,
  getMovementTypeLabel,
  listCategoryRules,
  listTransactionCategories,
  saveCategoryRule,
  saveTransactionCategory,
  type CategoryRule,
  type TransactionCategory
} from '@/features/finance/lib/categories';
import {
  getDashboardSummary,
  type DashboardTransaction,
  type DashboardSummary
} from '@/features/finance/lib/dashboard';
import type { MovementType } from '@/features/finance/lib/import/types';
import {
  getMovementFiltersContext,
  listMovements,
  updateMovement,
  type MoneyMovement,
  type MovementFilters,
  type MovementReviewFilter
} from '@/features/finance/lib/movements';
import {
  archiveFinancialContainer,
  archivePatrimonyAsset,
  createPatrimonialStartingPoint,
  resetPatrimonialStartingPoint,
  resetWorkspaceFinancialData,
  movePatrimonyAsset,
  saveFinancialContainer,
  savePatrimonyAsset,
  type AssetType,
  type ContainerType,
  type CreateStartingPointAssetInput,
  type CreateStartingPointContainerInput,
  type FinancialContainer,
  type PatrimonyAsset,
  type SnapshotItemType
} from '@/features/finance/lib/snapshots';
import { ActionButton } from '@/features/onboarding/components/ActionButton';
import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type AuthenticatedDashboardProps = {
  onSignOut?: () => void;
  userEmail?: string | null;
};

type AppSection =
  | 'dashboard'
  | 'income'
  | 'expenses'
  | 'veramar'
  | 'savings'
  | 'accounts'
  | 'import'
  | 'movements'
  | 'ai'
  | 'categories'
  | 'assets'
  | 'goals'
  | 'snapshot'
  | 'settings';

type NavigationItem = {
  section: AppSection;
  label: string;
  detail: string;
};

const navigationItems = [
  {
    section: 'dashboard',
    label: 'Inicio',
    detail: 'Balance general'
  },
  {
    section: 'income',
    label: 'Ingresos',
    detail: 'Fuentes anuales'
  },
  {
    section: 'expenses',
    label: 'Gastos',
    detail: 'Fijos y variables'
  },
  {
    section: 'veramar',
    label: 'Veramar',
    detail: 'Mini negocio'
  },
  {
    section: 'savings',
    label: 'Ahorro/Inversion',
    detail: 'Transferencias y activos'
  },
  {
    section: 'accounts',
    label: 'Cuentas',
    detail: 'Saldos actuales'
  },
  {
    section: 'movements',
    label: 'Movimientos',
    detail: 'Detalle filtrable'
  },
  {
    section: 'ai',
    label: 'IA',
    detail: 'Interpretacion financiera'
  }
] satisfies NavigationItem[];

const utilityNavigationItems = [
  {
    section: 'import',
    label: 'Importar movimientos',
    detail: 'Excel o CSV bancario'
  },
  {
    section: 'categories',
    label: 'Categorias',
    detail: 'Reglas automaticas'
  },
  {
    section: 'assets',
    label: 'Activos',
    detail: 'Detalle patrimonial'
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
  const [annualSummary, setAnnualSummary] = useState<AnnualControlSummary | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isAnnualLoading, setIsAnnualLoading] = useState(true);
  const [annualError, setAnnualError] = useState<string | null>(null);
  const [movementInitialFilters, setMovementInitialFilters] =
    useState<MovementFilters | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (summary) {
      void loadAnnualSummary(summary, selectedYear);
    }
  }, [summary, selectedYear]);

  function handleSelectSection(section: AppSection) {
    setActiveSection(section);
    setIsMenuOpen(false);
    setToastMessage(null);

    if (section === 'movements') {
      setMovementInitialFilters(null);
    }

    if (
      section === 'dashboard' ||
      section === 'movements' ||
      section === 'categories' ||
      section === 'settings'
    ) {
      void loadDashboard();
    }
  }

  function handleOpenMovementsFromCell(target: AnnualCellTarget) {
    const monthStart = new Date(Date.UTC(target.year, target.month, 1));
    const monthEnd = new Date(Date.UTC(target.year, target.month + 1, 0));

    setMovementInitialFilters({
      accountId: '',
      categoryId: target.categoryId ?? '',
      dateFrom: formatDateInput(monthStart),
      dateTo: formatDateInput(monthEnd),
      metric: target.metric,
      movementType: target.movementType,
      search: target.search ?? ''
    });
    setActiveSection('movements');
    setIsMenuOpen(false);
    setToastMessage(null);
  }

  let sectionContent = (
    <HomePanel
      error={error}
      annualError={annualError}
      annualSummary={annualSummary}
      isLoading={isLoading}
      isAnnualLoading={isAnnualLoading}
      onCellClick={handleOpenMovementsFromCell}
      onYearChange={setSelectedYear}
      selectedYear={selectedYear}
      summary={summary}
      onCreateSnapshot={() => handleSelectSection('snapshot')}
      onImportMovements={() => handleSelectSection('import')}
      onRetry={() => void loadDashboard()}
      onViewMovements={() => handleSelectSection('movements')}
    />
  );

  if (activeSection === 'income') {
    sectionContent = (
      <IncomePanel
        annualError={annualError}
        annualSummary={annualSummary}
        isLoading={isLoading || isAnnualLoading}
        onCellClick={handleOpenMovementsFromCell}
      />
    );
  }

  if (activeSection === 'expenses') {
    sectionContent = (
      <ExpensesPanel
        annualError={annualError}
        annualSummary={annualSummary}
        isLoading={isLoading || isAnnualLoading}
        onCellClick={handleOpenMovementsFromCell}
      />
    );
  }

  if (activeSection === 'veramar') {
    sectionContent = (
      <VeramarPanel
        annualError={annualError}
        annualSummary={annualSummary}
        isLoading={isLoading || isAnnualLoading}
        onCellClick={handleOpenMovementsFromCell}
      />
    );
  }

  if (activeSection === 'savings') {
    sectionContent = (
      <SavingsPanel
        annualError={annualError}
        annualSummary={annualSummary}
        isLoading={isLoading || isAnnualLoading}
        onCellClick={handleOpenMovementsFromCell}
      />
    );
  }

  if (activeSection === 'accounts') {
    sectionContent = (
      <ContainersPanel
        summary={summary}
        onCreateStartingPoint={() => handleSelectSection('snapshot')}
        onUpdated={(message) => {
          setToastMessage(message);
          void loadDashboard();
        }}
      />
    );
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
        initialFilters={movementInitialFilters}
        onRetry={() => void loadDashboard()}
        onUpdated={() => void loadDashboard()}
      />
    );
  }

  if (activeSection === 'categories') {
    sectionContent = <CategoriesPanel summary={summary} />;
  }

  if (activeSection === 'snapshot') {
    sectionContent = (
      <SnapshotPanel
        summary={summary}
        onBack={() => handleSelectSection('dashboard')}
        onSaved={() => {
          setActiveSection('dashboard');
          void loadDashboard();
        }}
      />
    );
  }

  if (activeSection === 'assets') {
    sectionContent = (
      <AssetsPanel
        summary={summary}
        onUpdated={(message) => {
          setToastMessage(message);
          void loadDashboard();
        }}
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

  if (activeSection === 'ai') {
    sectionContent = (
      <EmptySection
        eyebrow="IA financiera"
        title="Interpretacion preparada"
        copy="Aqui aparecera el analisis financiero de Capitalia cuando conectemos la capa de IA sobre tus datos reales."
      />
    );
  }

  if (activeSection === 'settings') {
    sectionContent = (
      <SettingsPanel
        summary={summary}
        onOpenSnapshot={() => setActiveSection('snapshot')}
        onRedoStartingPoint={() => {
          setSummary((current) =>
            current
              ? {
                  ...current,
                  initialDebt: null,
                  initialGrossWorth: null,
                  initialNetWorth: null,
                  snapshot: null
                }
              : current
          );
          setActiveSection('snapshot');
        }}
        onReset={(message) => {
          setToastMessage(message);
          setActiveSection('dashboard');
          void loadDashboard();
        }}
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

  async function loadAnnualSummary(nextSummary: DashboardSummary, year: number) {
    setIsAnnualLoading(true);
    setAnnualError(null);

    try {
      setAnnualSummary(await getAnnualControlSummary({ summary: nextSummary, year }));
    } catch (summaryError) {
      setAnnualError(getErrorMessage(summaryError));
      setAnnualSummary(null);
    } finally {
      setIsAnnualLoading(false);
    }
  }

  return (
    <ExperienceFrame className="dashboard-screen">
      {!isMenuOpen ? (
        <header className="app-header">
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
          <BrandMark />
          <div className="dashboard-session">
            {userEmail ? <span>Sesion activa: {userEmail}</span> : null}
          </div>
        </header>
      ) : null}

      <NavigationDrawer
        activeSection={activeSection}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onSelect={handleSelectSection}
        onSignOut={onSignOut}
        userEmail={userEmail}
      />

      {toastMessage ? (
        <p className="app-toast" role="status">
          {toastMessage}
        </p>
      ) : null}

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
          <span className="drawer-nav__label">Herramientas</span>
          {utilityNavigationItems.map((item) => (
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

function AppModal({
  children,
  className = '',
  contentClassName = '',
  eyebrow,
  footer,
  onClose,
  subtitle,
  title,
  closeLabel = 'Cerrar modal'
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  eyebrow?: string;
  footer?: ReactNode;
  onClose: () => void;
  subtitle?: ReactNode;
  title: ReactNode;
  closeLabel?: string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const animationFrame = window.requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0 });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const modal = (
    <div className="app-modal-backdrop" role="presentation">
      <section
        className={className ? `app-modal ${className}` : 'app-modal'}
        role="dialog"
        aria-modal="true"
      >
        <div className="app-modal__header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button
            aria-label={closeLabel}
            className="app-modal__close"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </div>
        <div
          className={
            contentClassName
              ? `app-modal__content ${contentClassName}`
              : 'app-modal__content'
          }
          ref={contentRef}
        >
          {children}
        </div>
        {footer ? <div className="app-modal__footer">{footer}</div> : null}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}

type HomePanelProps = {
  annualError: string | null;
  annualSummary: AnnualControlSummary | null;
  error: string | null;
  isAnnualLoading: boolean;
  isLoading: boolean;
  onCellClick: (target: AnnualCellTarget) => void;
  summary: DashboardSummary | null;
  selectedYear: number;
  onCreateSnapshot: () => void;
  onImportMovements: () => void;
  onRetry: () => void;
  onViewMovements: () => void;
  onYearChange: (year: number) => void;
};

function HomePanel({
  annualError,
  annualSummary,
  error,
  isAnnualLoading,
  isLoading,
  onCellClick,
  onCreateSnapshot,
  onImportMovements,
  onRetry,
  onViewMovements,
  onYearChange,
  selectedYear,
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

  const hasContainers = summary.containers.length > 0;
  const hasTransactions = summary.recentTransactions.length > 0;
  const hasStartingPoint = Boolean(summary.snapshot);
  const containerGrossWorth = getAllContainerAssets(summary.containers)
    .filter((asset) => asset.assetType !== 'liability')
    .reduce((total, asset) => total + Math.max(asset.manualValue, 0), 0);
  const containerDebt = getAllContainerAssets(summary.containers)
    .filter((asset) => asset.assetType === 'liability')
    .reduce((total, asset) => total + Math.abs(asset.manualValue), 0);
  const initialGrossWorth = summary.initialGrossWorth ?? containerGrossWorth;
  const initialDebt = summary.initialDebt ?? containerDebt;
  const initialNetWorth = summary.initialNetWorth ?? initialGrossWorth - initialDebt;
  const currentAccountRows =
    summary.accounts.length > 0
      ? summary.accounts.map((account) => ({
          currency: account.currency,
          id: account.id,
          label: account.name,
          value: account.balance
        }))
      : summary.containers.map((container) => ({
          currency: container.currency,
          id: container.id,
          label: getContainerDisplayName(container),
          value: container.totalValue
        }));
  const yearOptions = annualSummary?.availableYears.length
    ? annualSummary.availableYears
    : [selectedYear];

  return (
    <>
      <section className="dashboard-hero annual-hero" aria-label="Balance general">
        <p className="eyebrow">{summary.workspace.name}</p>
        <div>
          <span>Balance general</span>
          <strong>{selectedYear}</strong>
        </div>
        <p>Construyes patrimonio, no controlas gastos.</p>
        <label className="year-selector">
          <span>Ano</span>
          <select
            onChange={(event) => onYearChange(Number(event.target.value))}
            value={selectedYear}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!hasStartingPoint && !hasContainers ? (
        <section className="empty-state-card">
          <span>Define tu punto de partida</span>
          <p>
            Anade tus cuentas, inversiones, activos y deudas para que Capitalia pueda
            calcular tu patrimonio correctamente.
          </p>
          <button className="text-link" onClick={onCreateSnapshot} type="button">
            Configurar patrimonio inicial
          </button>
        </section>
      ) : (
        <section className="metric-grid annual-kpi-grid" aria-label="Resumen anual">
          <MetricCard
            label="Ingresos anuales"
            value={formatMoney(annualSummary?.annualIncome ?? 0, summary.currency)}
            tone="income"
          />
          <MetricCard
            label="Gastos anuales"
            value={formatMoney(annualSummary?.annualExpenses ?? 0, summary.currency)}
            tone="expense"
          />
          <MetricCard
            label="Balance anual"
            value={formatMoney(annualSummary?.annualBalance ?? 0, summary.currency)}
            tone="balance"
          />
          <MetricCard
            label="Patrimonio actual"
            value={formatMoney(
              annualSummary?.netWorth ?? summary.netWorth,
              summary.currency
            )}
            tone="investment"
          />
        </section>
      )}

      <AnnualStatus error={annualError} isLoading={isAnnualLoading} onRetry={onRetry} />

      {annualSummary ? (
        <AnnualTable
          currency={annualSummary.currency}
          onCellClick={onCellClick}
          rows={annualSummary.balanceRows}
          title="Resumen mensual"
        />
      ) : null}

      <section className="accounts-panel" aria-label="Cuentas actuales">
        <div className="section-heading accounts-heading">
          <div>
            <p className="eyebrow">Cuentas</p>
            <h2>Saldos actuales</h2>
          </div>
          <strong>
            {formatMoney(annualSummary?.netWorth ?? summary.netWorth, summary.currency)}
          </strong>
        </div>

        {currentAccountRows.length > 0 ? (
          <div className="account-list">
            {currentAccountRows.map((account) => (
              <article className="account-row" key={account.id}>
                <div>
                  <strong>{account.label}</strong>
                  <span>{account.currency}</span>
                </div>
                <div>
                  <strong>{formatMoney(account.value, account.currency)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state-card">
            <span>Sin cuentas con saldo</span>
            <p>
              Define tu punto de partida o importa movimientos para ver saldos reales.
            </p>
          </div>
        )}
      </section>

      <section className="metric-grid" aria-label="Punto de partida">
        <MetricCard
          label="Patrimonio inicial"
          value={formatMoney(initialNetWorth, summary.currency)}
          hint="Punto de partida"
        />
        <MetricCard
          label="Patrimonio bruto"
          value={formatMoney(initialGrossWorth, summary.currency)}
        />
        <MetricCard label="Deudas" value={formatMoney(initialDebt, summary.currency)} />
      </section>

      {!hasContainers && !hasStartingPoint ? (
        <section className="empty-state-card">
          <span>Importa tu primera cuenta</span>
          <p>Define tu punto de partida antes de importar movimientos.</p>
          <div className="empty-state-actions">
            <button className="text-link" onClick={onCreateSnapshot} type="button">
              Configurar patrimonio inicial
            </button>
            <button className="text-link" onClick={onImportMovements} type="button">
              Importar movimientos
            </button>
          </div>
        </section>
      ) : null}

      <button className="import-entry-card" onClick={onImportMovements} type="button">
        <span>Importar movimientos</span>
        <strong>Excel o CSV bancario</strong>
      </button>

      <section className="assets-panel compact-activity" aria-label="Ultimos movimientos">
        <div className="section-heading">
          <p className="eyebrow">Actividad</p>
          <h2>Ultimos movimientos</h2>
          <button className="text-link" onClick={onViewMovements} type="button">
            Ver todos los movimientos
          </button>
        </div>

        {hasTransactions ? (
          <div className="asset-list">
            {summary.recentTransactions.map((transaction) => (
              <article className="asset-row" key={transaction.id}>
                <div>
                  <strong>{getTransactionTitle(transaction)}</strong>
                  <span>{getTransactionSubtitle(transaction)}</span>
                </div>
                <div>
                  <strong>
                    {transaction.direction === 'inflow' ? '+' : '-'}
                    {formatMoney(transaction.amount, transaction.currency)}
                  </strong>
                  <div className="transaction-meta-chips">
                    <small>{getMovementTypeLabel(transaction.movementType)}</small>
                    <small>{transaction.categoryName ?? 'Sin categoria'}</small>
                    <small>{transaction.accountName}</small>
                  </div>
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

function AnnualStatus({
  error,
  isLoading,
  onRetry
}: {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <p className="panel-status">Calculando balance anual real...</p>;
  }

  if (!error) {
    return null;
  }

  return (
    <section className="empty-state-card">
      <span>No se pudo calcular el resumen anual.</span>
      <p>{error}</p>
      <button className="text-link" onClick={onRetry} type="button">
        Reintentar
      </button>
    </section>
  );
}

function AnnualTable({
  currency,
  onCellClick,
  rows,
  title
}: {
  currency: string;
  onCellClick: (target: AnnualCellTarget) => void;
  rows: AnnualTableRow[];
  title: string;
}) {
  return (
    <section className="annual-table-card" aria-label={title}>
      <div className="section-heading annual-table-heading">
        <p className="eyebrow">Excel inteligente</p>
        <h2>{title}</h2>
        <span>Cada celda abre movimientos filtrados</span>
      </div>
      <div className="annual-table-scroll">
        <table className="annual-table">
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              {monthLabels.map((month) => (
                <th scope="col" key={month}>
                  {month}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={`annual-table__row annual-table__row--${row.tone}`}
                key={row.key}
              >
                <th scope="row">
                  {row.group ? <small>{row.group}</small> : null}
                  <span>{row.label}</span>
                </th>
                {row.values.map((value, month) => (
                  <td key={`${row.key}-${month}`}>
                    <button
                      className="annual-cell-button"
                      onClick={() => {
                        const target = row.targets[month];

                        if (target) {
                          onCellClick(target);
                        }
                      }}
                      type="button"
                    >
                      {formatCompactMoney(value, currency)}
                    </button>
                  </td>
                ))}
                <td>
                  <strong>{formatCompactMoney(row.total, currency)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncomePanel({
  annualError,
  annualSummary,
  isLoading,
  onCellClick
}: {
  annualError: string | null;
  annualSummary: AnnualControlSummary | null;
  isLoading: boolean;
  onCellClick: (target: AnnualCellTarget) => void;
}) {
  if (isLoading) {
    return <p className="panel-status">Cargando ingresos reales...</p>;
  }

  if (annualError) {
    return (
      <AnnualStatus error={annualError} isLoading={false} onRetry={() => undefined} />
    );
  }

  if (!annualSummary) {
    return null;
  }

  return (
    <section className="annual-section" aria-label="Ingresos">
      <div className="section-heading">
        <p className="eyebrow">Ingresos</p>
        <h2>Fuentes del ano</h2>
        <span>{formatMoney(annualSummary.annualIncome, annualSummary.currency)}</span>
      </div>
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.incomeRows}
        title="Ingresos por fuente"
      />
    </section>
  );
}

function ExpensesPanel({
  annualError,
  annualSummary,
  isLoading,
  onCellClick
}: {
  annualError: string | null;
  annualSummary: AnnualControlSummary | null;
  isLoading: boolean;
  onCellClick: (target: AnnualCellTarget) => void;
}) {
  if (isLoading) {
    return <p className="panel-status">Cargando gastos reales...</p>;
  }

  if (annualError) {
    return (
      <AnnualStatus error={annualError} isLoading={false} onRetry={() => undefined} />
    );
  }

  if (!annualSummary) {
    return null;
  }

  return (
    <section className="annual-section" aria-label="Gastos">
      <div className="section-heading">
        <p className="eyebrow">Gastos</p>
        <h2>Fijos y variables</h2>
        <span>{formatMoney(annualSummary.annualExpenses, annualSummary.currency)}</span>
      </div>
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.expenseRows}
        title="Gastos por categoria"
      />
    </section>
  );
}

function VeramarPanel({
  annualError,
  annualSummary,
  isLoading,
  onCellClick
}: {
  annualError: string | null;
  annualSummary: AnnualControlSummary | null;
  isLoading: boolean;
  onCellClick: (target: AnnualCellTarget) => void;
}) {
  if (isLoading) {
    return <p className="panel-status">Cargando Veramar...</p>;
  }

  if (annualError) {
    return (
      <AnnualStatus error={annualError} isLoading={false} onRetry={() => undefined} />
    );
  }

  if (!annualSummary) {
    return null;
  }

  return (
    <section className="annual-section" aria-label="Veramar">
      <div className="section-heading">
        <p className="eyebrow">Veramar</p>
        <h2>Mini negocio</h2>
        <span>
          {formatMoney(annualSummary.veramar.totalBalance, annualSummary.currency)}
        </span>
      </div>
      <section className="metric-grid annual-kpi-grid">
        <MetricCard
          label="Ingresos Booking"
          tone="income"
          value={formatMoney(annualSummary.veramar.totalIncome, annualSummary.currency)}
        />
        <MetricCard
          label="Gastos Veramar"
          tone="expense"
          value={formatMoney(annualSummary.veramar.totalExpenses, annualSummary.currency)}
        />
        <MetricCard
          label="Balance Veramar"
          tone="balance"
          value={formatMoney(annualSummary.veramar.totalBalance, annualSummary.currency)}
        />
      </section>
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={[
          {
            key: 'veramar-income-total',
            label: 'Ingresos Booking',
            targets: annualSummary.veramar.monthlyIncome.map((_, month) => ({
              month,
              movementType: 'income',
              search: 'booking',
              year: annualSummary.year
            })),
            tone: 'income',
            total: annualSummary.veramar.totalIncome,
            values: annualSummary.veramar.monthlyIncome
          },
          {
            key: 'veramar-expense-total',
            label: 'Gastos Veramar',
            targets: annualSummary.veramar.monthlyExpenses.map((_, month) => ({
              month,
              movementType: 'expense',
              search: 'veramar',
              year: annualSummary.year
            })),
            tone: 'expense',
            total: annualSummary.veramar.totalExpenses,
            values: annualSummary.veramar.monthlyExpenses
          },
          {
            key: 'veramar-balance-total',
            label: 'Balance Veramar',
            targets: annualSummary.veramar.monthlyBalance.map((_, month) => ({
              month,
              movementType: 'all',
              search: 'veramar',
              year: annualSummary.year
            })),
            tone: 'balance',
            total: annualSummary.veramar.totalBalance,
            values: annualSummary.veramar.monthlyBalance
          }
        ]}
        title="Resumen mensual Veramar"
      />
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.veramar.incomeRows}
        title="Desglose de ingresos"
      />
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.veramar.expenseRows}
        title="Desglose de gastos"
      />
    </section>
  );
}

function SavingsPanel({
  annualError,
  annualSummary,
  isLoading,
  onCellClick
}: {
  annualError: string | null;
  annualSummary: AnnualControlSummary | null;
  isLoading: boolean;
  onCellClick: (target: AnnualCellTarget) => void;
}) {
  if (isLoading) {
    return <p className="panel-status">Cargando ahorro e inversion...</p>;
  }

  if (annualError) {
    return (
      <AnnualStatus error={annualError} isLoading={false} onRetry={() => undefined} />
    );
  }

  if (!annualSummary) {
    return null;
  }

  return (
    <section className="annual-section" aria-label="Ahorro e inversion">
      <div className="section-heading">
        <p className="eyebrow">Ahorro / Inversion</p>
        <h2>Construccion patrimonial</h2>
        <span>Transferencias y plataformas</span>
      </div>
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.savings.destinationRows}
        title="Resumen por destino"
      />
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.savings.platformRows}
        title="Bloques por plataforma"
      />
      <AnnualTable
        currency={annualSummary.currency}
        onCellClick={onCellClick}
        rows={annualSummary.savings.assetPurchaseRows}
        title="Compras de activos"
      />
      <section className="annual-table-card">
        <div className="section-heading">
          <p className="eyebrow">Transferencias</p>
          <h2>Entre cuentas</h2>
          <span>{annualSummary.savings.transferRows.length} movimientos</span>
        </div>
        {annualSummary.savings.transferRows.length > 0 ? (
          <div className="transfer-list">
            {annualSummary.savings.transferRows.map((transfer) => (
              <article className="account-row" key={transfer.id}>
                <div>
                  <strong>
                    {transfer.origin} a {transfer.destination}
                  </strong>
                  <span>
                    {formatDate(transfer.date)} - {monthLabels[transfer.month]}
                  </span>
                </div>
                <div>
                  <strong>{formatMoney(transfer.amount, transfer.currency)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state-card">
            <span>Sin transferencias detectadas</span>
            <p>Marca transferencias internas en Movimientos para verlas aqui.</p>
          </div>
        )}
      </section>
    </section>
  );
}

type MovementsPanelProps = {
  error: string | null;
  initialFilters: MovementFilters | null;
  isLoading: boolean;
  summary: DashboardSummary | null;
  onImportMovements: () => void;
  onRetry: () => void;
  onUpdated: () => void;
};

function MovementsPanel({
  error,
  initialFilters,
  isLoading,
  onImportMovements,
  onRetry,
  onUpdated,
  summary
}: MovementsPanelProps) {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [movements, setMovements] = useState<MoneyMovement[]>([]);
  const [filters, setFilters] = useState<MovementFilters>(defaultMovementFilters);
  const [selectedMovement, setSelectedMovement] = useState<MoneyMovement | null>(null);
  const [editState, setEditState] = useState<MovementEditState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(getDefaultMovementsPageSize);
  const [totalMovements, setTotalMovements] = useState(0);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const workspaceId = summary?.workspace.id;

  useEffect(() => {
    if (initialFilters) {
      setFilters(initialFilters);
      setPage(1);
    }
  }, [initialFilters]);

  useEffect(() => {
    if (!workspaceId) {
      setCategories([]);
      setAccounts([]);
      setMovements([]);
      return;
    }

    void loadMovementContext(workspaceId);
  }, [workspaceId]);

  const loadMovementPage = useCallback(async () => {
    if (!workspaceId) {
      return;
    }

    setIsLoadingMovements(true);
    setLocalError(null);

    try {
      const result = await listMovements({
        accounts,
        categories,
        filters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        workspaceId
      });

      setMovements(result.movements);
      setTotalMovements(result.total);
    } catch (movementError) {
      setLocalError(getErrorMessage(movementError));
    } finally {
      setIsLoadingMovements(false);
    }
  }, [accounts, categories, filters, page, pageSize, workspaceId]);

  useEffect(() => {
    if (!workspaceId || accounts.length === 0) {
      return;
    }

    void loadMovementPage();
  }, [accounts.length, loadMovementPage, workspaceId]);

  const totalPages = Math.max(1, Math.ceil(totalMovements / pageSize));
  const firstVisibleMovement = totalMovements === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisibleMovement = Math.min(page * pageSize, totalMovements);
  const movementsCounterLabel = getMovementsCounterLabel(
    firstVisibleMovement,
    lastVisibleMovement,
    totalMovements
  );

  async function loadMovementContext(workspaceId: string) {
    try {
      const context = await getMovementFiltersContext(workspaceId);
      setAccounts(context.accounts);
      setCategories(context.categories);
    } catch (contextError) {
      setLocalError(getErrorMessage(contextError));
    }
  }

  function openMovementEditor(movement: MoneyMovement) {
    setSelectedMovement(movement);
    setEditState({
      accountId: movement.accountId,
      categoryId: movement.categoryId ?? '',
      isReviewed: movement.isReviewed,
      movementType: movement.movementType,
      notes: movement.notes ?? '',
      rememberRule: false
    });
  }

  async function handleSaveMovement() {
    if (!summary || !selectedMovement || !editState) {
      return;
    }

    setIsSavingMovement(true);
    setLocalError(null);

    try {
      await updateMovement({
        accountId: editState.accountId,
        categoryId: editState.categoryId || null,
        description: selectedMovement.description,
        isReviewed: editState.isReviewed,
        movementType: editState.movementType,
        notes: editState.notes.trim() || null,
        rememberRule: editState.rememberRule,
        transactionId: selectedMovement.id,
        workspaceId: summary.workspace.id
      });
      setSelectedMovement(null);
      setEditState(null);
      await loadMovementPage();
      onUpdated();
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setIsSavingMovement(false);
    }
  }

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

  return (
    <section className="assets-panel" aria-label="Movimientos">
      <div className="section-heading">
        <p className="eyebrow">Flujo de dinero</p>
        <h2>Movimientos</h2>
        <span>{movementsCounterLabel}</span>
      </div>

      {localError ? (
        <p className="auth-message auth-message--error">{localError}</p>
      ) : null}

      <MovementFiltersPanel
        accounts={accounts}
        categories={categories}
        filters={filters}
        resultLabel={movementsCounterLabel}
        onChange={(nextFilters) => {
          setPage(1);
          setFilters(nextFilters);
        }}
      />

      {isLoadingMovements && movements.length === 0 ? (
        <p className="panel-status">Cargando movimientos...</p>
      ) : null}

      {movements.length > 0 ? (
        <>
          <div className="asset-list">
            {movements.map((movement) => (
              <button
                className="asset-row transaction-row transaction-row-button"
                key={movement.id}
                onClick={() => openMovementEditor(movement)}
                type="button"
              >
                <div className="transaction-row__main">
                  <strong>{getTransactionTitle(movement)}</strong>
                  <span>{getTransactionSubtitle(movement)}</span>
                  <small>
                    {getMovementTypeLabel(movement.movementType)} -{' '}
                    {movement.categoryName ?? 'Sin categoria'}
                  </small>
                </div>
                <div className="transaction-row__amount">
                  <strong>
                    {movement.direction === 'inflow' ? '+' : '-'}
                    {formatMoney(movement.amount, movement.currency)}
                  </strong>
                  <small>{movement.isReviewed ? 'Revisado' : 'Pendiente'}</small>
                </div>
              </button>
            ))}
          </div>

          <MovementPagination
            isLoading={isLoadingMovements}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPage(1);
              setPageSize(nextPageSize);
            }}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalMovements}
          />
        </>
      ) : (
        <div className="empty-state-card">
          <span>Sin movimientos</span>
          <p>Importa movimientos reales para construir tu actividad financiera.</p>
          <button className="text-link" onClick={onImportMovements} type="button">
            Importar movimientos
          </button>
        </div>
      )}

      {selectedMovement && editState ? (
        <MovementEditorModal
          accounts={accounts}
          categories={categories}
          editState={editState}
          isSaving={isSavingMovement}
          movement={selectedMovement}
          onClose={() => {
            setSelectedMovement(null);
            setEditState(null);
          }}
          onSave={() => void handleSaveMovement()}
          setEditState={setEditState}
        />
      ) : null}
    </section>
  );
}

type MovementEditState = {
  movementType: MovementType;
  categoryId: string;
  accountId: string;
  notes: string;
  isReviewed: boolean;
  rememberRule: boolean;
};

const defaultMovementFilters = {
  accountId: '',
  categoryId: '',
  dateFrom: '',
  dateTo: '',
  metric: undefined,
  movementType: 'all',
  search: ''
} satisfies MovementFilters;

function getDefaultMovementsPageSize() {
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 760px)').matches) {
    return 20;
  }

  return 10;
}

function getMovementsCounterLabel(first: number, last: number, total: number) {
  if (total === 0) {
    return 'Sin movimientos';
  }

  return `Mostrando ${first}-${last} de ${total}`;
}

function MovementFiltersPanel({
  accounts,
  categories,
  filters,
  onChange,
  resultLabel
}: {
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  filters: MovementFilters;
  onChange: Dispatch<SetStateAction<MovementFilters>>;
  resultLabel: string;
}) {
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<MovementFilters>(filters);

  useEffect(() => {
    if (isFilterModalOpen) {
      setDraftFilters(filters);
    }
  }, [filters, isFilterModalOpen]);

  function updateSearch(search: string) {
    onChange((current) => ({ ...current, search }));
  }

  function getClearedAdvancedFilters() {
    const clearedFilters = {
      ...defaultMovementFilters,
      search: filters.search
    };

    return clearedFilters;
  }

  function clearDesktopAdvancedFilters() {
    onChange(getClearedAdvancedFilters());
  }

  function clearDraftAdvancedFilters() {
    setDraftFilters(getClearedAdvancedFilters());
  }

  function applyDraftFilters() {
    onChange(draftFilters);
    setIsFilterModalOpen(false);
  }

  return (
    <section className="movement-filters" aria-label="Filtros de movimientos">
      <div className="movement-filters__compact">
        <label>
          <span>Buscar</span>
          <input
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Descripcion"
            type="search"
            value={filters.search}
          />
        </label>
        <button
          className="movement-filter-button"
          onClick={() => setIsFilterModalOpen(true)}
          type="button"
        >
          Filtros
        </button>
        <span className="movement-filters__counter">{resultLabel}</span>
      </div>

      <div className="movement-filters__advanced movement-filters__advanced--desktop">
        <MovementAdvancedFilters
          accounts={accounts}
          categories={categories}
          filters={filters}
          onChange={(patch) => onChange((current) => ({ ...current, ...patch }))}
        />
        <div className="movement-filters__actions movement-filters__actions--desktop">
          <button
            className="text-link"
            onClick={clearDesktopAdvancedFilters}
            type="button"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {isFilterModalOpen ? (
        <MovementFiltersModal
          accounts={accounts}
          categories={categories}
          draftFilters={draftFilters}
          onApply={applyDraftFilters}
          onChange={(patch) => setDraftFilters((current) => ({ ...current, ...patch }))}
          onClear={clearDraftAdvancedFilters}
          onClose={() => setIsFilterModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

function MovementAdvancedFilters({
  accounts,
  categories,
  filters,
  onChange
}: {
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  filters: MovementFilters;
  onChange: (patch: Partial<MovementFilters>) => void;
}) {
  return (
    <>
      <label>
        <span>Tipo</span>
        <select
          onChange={(event) =>
            onChange({
              metric: undefined,
              movementType: event.target.value as MovementReviewFilter
            })
          }
          value={filters.movementType}
        >
          <option value="all">Todos</option>
          <option value="income">Ingresos</option>
          <option value="expense">Gastos reales</option>
          <option value="investment">Inversiones</option>
          <option value="transfer">Transferencias</option>
          <option value="pending">Pendientes de revisar</option>
        </select>
      </label>
      <label>
        <span>Cuenta / plataforma</span>
        <select
          onChange={(event) => onChange({ accountId: event.target.value })}
          value={filters.accountId}
        >
          <option value="">Todas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {getFinancialAccountLabel(account)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Categoria</span>
        <select
          onChange={(event) => onChange({ categoryId: event.target.value })}
          value={filters.categoryId}
        >
          <option value="">Todas</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="account-form__grid movement-filters__dates">
        <label>
          <span>Desde</span>
          <input
            onChange={(event) => onChange({ dateFrom: event.target.value })}
            type="date"
            value={filters.dateFrom}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            onChange={(event) => onChange({ dateTo: event.target.value })}
            type="date"
            value={filters.dateTo}
          />
        </label>
      </div>
    </>
  );
}

function MovementFiltersModal({
  accounts,
  categories,
  draftFilters,
  onApply,
  onChange,
  onClear,
  onClose
}: {
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  draftFilters: MovementFilters;
  onApply: () => void;
  onChange: (patch: Partial<MovementFilters>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <AppModal
      className="movement-filter-modal"
      closeLabel="Cerrar filtros"
      eyebrow="Filtros"
      footer={
        <>
          <button className="text-link" onClick={onClear} type="button">
            Limpiar filtros
          </button>
          <button
            className="danger-button movement-filters__apply"
            onClick={onApply}
            type="button"
          >
            Aplicar filtros
          </button>
        </>
      }
      onClose={onClose}
      title="Refinar movimientos"
    >
      <MovementAdvancedFilters
        accounts={accounts}
        categories={categories}
        filters={draftFilters}
        onChange={onChange}
      />
    </AppModal>
  );
}

function MovementPagination({
  isLoading,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  total,
  totalPages
}: {
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  return (
    <nav className="movement-pagination" aria-label="Paginacion de movimientos">
      <button
        className="text-link"
        disabled={isLoading || page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        type="button"
      >
        Anterior
      </button>
      <span>
        Pagina {page} de {totalPages}
      </span>
      <button
        className="text-link"
        disabled={isLoading || page >= totalPages || total === 0}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        type="button"
      >
        Siguiente
      </button>
      <label>
        <span>Por pagina</span>
        <select
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
    </nav>
  );
}

function MovementEditorModal({
  accounts,
  categories,
  editState,
  isSaving,
  movement,
  onClose,
  onSave,
  setEditState
}: {
  accounts: FinancialAccount[];
  categories: TransactionCategory[];
  editState: MovementEditState;
  isSaving: boolean;
  movement: MoneyMovement;
  onClose: () => void;
  onSave: () => void;
  setEditState: Dispatch<SetStateAction<MovementEditState | null>>;
}) {
  const matchingCategories = categories.filter(
    (category) => category.movementType === editState.movementType
  );

  return (
    <AppModal
      className="movement-editor"
      closeLabel="Cerrar revision"
      contentClassName="account-form movement-editor__content"
      eyebrow="Movimiento"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="danger-button"
            disabled={isSaving}
            onClick={onSave}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </>
      }
      onClose={onClose}
      subtitle={movement.description}
      title="Revisar"
    >
      <label>
        <span>Tipo</span>
        <select
          onChange={(event) =>
            setEditState((current) =>
              current
                ? {
                    ...current,
                    categoryId: '',
                    movementType: event.target.value as MovementType
                  }
                : current
            )
          }
          value={editState.movementType}
        >
          <option value="income">Ingreso</option>
          <option value="expense">Gasto real</option>
          <option value="investment">Inversion</option>
          <option value="transfer">Transferencia interna</option>
        </select>
      </label>
      <label>
        <span>Categoria</span>
        <select
          onChange={(event) =>
            setEditState((current) =>
              current ? { ...current, categoryId: event.target.value } : current
            )
          }
          value={editState.categoryId}
        >
          <option value="">Sin categoria</option>
          {matchingCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Cuenta / plataforma</span>
        <select
          onChange={(event) =>
            setEditState((current) =>
              current ? { ...current, accountId: event.target.value } : current
            )
          }
          value={editState.accountId}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {getFinancialAccountLabel(account)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Notas</span>
        <textarea
          onChange={(event) =>
            setEditState((current) =>
              current ? { ...current, notes: event.target.value } : current
            )
          }
          value={editState.notes}
        />
      </label>
      <div className="movement-editor__checks">
        <label className="remember-rule">
          <input
            checked={editState.isReviewed}
            onChange={(event) =>
              setEditState((current) =>
                current ? { ...current, isReviewed: event.target.checked } : current
              )
            }
            type="checkbox"
          />
          <span>Marcar como revisado</span>
        </label>
        <label className="remember-rule">
          <input
            checked={editState.movementType === 'transfer'}
            onChange={(event) =>
              setEditState((current) =>
                current
                  ? {
                      ...current,
                      categoryId: '',
                      movementType: event.target.checked
                        ? 'transfer'
                        : current.movementType === 'transfer'
                          ? 'expense'
                          : current.movementType
                    }
                  : current
              )
            }
            type="checkbox"
          />
          <span>Transferencia interna</span>
        </label>
        <label className="remember-rule">
          <input
            checked={editState.rememberRule}
            onChange={(event) =>
              setEditState((current) =>
                current ? { ...current, rememberRule: event.target.checked } : current
              )
            }
            type="checkbox"
          />
          <span>Guardar y recordar regla</span>
        </label>
      </div>
    </AppModal>
  );
}

type CategoriesPanelProps = {
  summary: DashboardSummary | null;
};

type CategoryFormState = {
  id: string | null;
  name: string;
  movementType: MovementType;
  icon: string;
  color: string;
  parentId: string;
};

type RuleFormState = {
  id: string | null;
  keyword: string;
  categoryId: string;
  priority: string;
};

const emptyCategoryForm: CategoryFormState = {
  color: '',
  icon: '',
  id: null,
  movementType: 'expense',
  name: '',
  parentId: ''
};

const emptyRuleForm: RuleFormState = {
  categoryId: '',
  id: null,
  keyword: '',
  priority: '50'
};

function CategoriesPanel({ summary }: CategoriesPanelProps) {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!summary?.workspace.id) {
      setIsLoading(false);
      return;
    }

    void loadCategoryData(summary.workspace.id);
  }, [summary?.workspace.id]);

  async function loadCategoryData(workspaceId: string) {
    setIsLoading(true);
    setError(null);

    try {
      const [nextCategories, nextRules] = await Promise.all([
        listTransactionCategories(workspaceId),
        listCategoryRules(workspaceId)
      ]);

      setCategories(nextCategories);
      setRules(nextRules);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveCategory() {
    if (!summary || !categoryForm.name.trim()) {
      setError('Escribe un nombre para la categoria.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveTransactionCategory({
        color: categoryForm.color,
        icon: categoryForm.icon,
        id: categoryForm.id ?? undefined,
        movementType: categoryForm.movementType,
        name: categoryForm.name,
        parentId: categoryForm.parentId || null,
        workspaceId: summary.workspace.id
      });
      setCategoryForm(emptyCategoryForm);
      await loadCategoryData(summary.workspace.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCategory(category: TransactionCategory) {
    if (!summary || category.system) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await deleteTransactionCategory({
        categoryId: category.id,
        workspaceId: summary.workspace.id
      });
      await loadCategoryData(summary.workspace.id);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveRule() {
    if (!summary || !ruleForm.keyword.trim() || !ruleForm.categoryId) {
      setError('Completa keyword y categoria para la regla.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveCategoryRule({
        categoryId: ruleForm.categoryId,
        id: ruleForm.id ?? undefined,
        keyword: ruleForm.keyword,
        priority: Number(ruleForm.priority),
        workspaceId: summary.workspace.id
      });
      setRuleForm(emptyRuleForm);
      await loadCategoryData(summary.workspace.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteRule(rule: CategoryRule) {
    if (!summary || !rule.workspaceId) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await deleteCategoryRule({
        ruleId: rule.id,
        workspaceId: summary.workspace.id
      });
      await loadCategoryData(summary.workspace.id);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="panel-status">Cargando categorias...</p>;
  }

  if (error) {
    return (
      <section className="empty-state-card">
        <span>No se pudieron cargar las categorias.</span>
        <p>{error}</p>
      </section>
    );
  }

  return (
    <section className="empty-section" aria-label="Categorias">
      <div className="section-heading">
        <p className="eyebrow">Categorias</p>
        <h2>Motor financiero</h2>
        <span>Reglas reales de clasificacion</span>
      </div>

      <section className="account-form" aria-label="Crear categoria">
        <div className="section-heading">
          <p className="eyebrow">Crear categoria</p>
          <span>Las categorias personalizadas aparecen en filtros e importaciones.</span>
        </div>
        <label>
          <span>Nombre</span>
          <input
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Ej. Gimnasio"
            type="text"
            value={categoryForm.name}
          />
        </label>
        <label>
          <span>Tipo</span>
          <select
            onChange={(event) =>
              setCategoryForm((current) => ({
                ...current,
                movementType: event.target.value as MovementType
              }))
            }
            value={categoryForm.movementType}
          >
            <option value="income">income</option>
            <option value="expense">expense</option>
            <option value="investment">investment</option>
            <option value="transfer">transfer</option>
          </select>
        </label>
        <div className="account-form__grid">
          <label>
            <span>Icono opcional</span>
            <input
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, icon: event.target.value }))
              }
              placeholder="circle"
              type="text"
              value={categoryForm.icon}
            />
          </label>
          <label>
            <span>Color opcional</span>
            <input
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, color: event.target.value }))
              }
              placeholder="#C4A15A"
              type="text"
              value={categoryForm.color}
            />
          </label>
        </div>
        <label>
          <span>Categoria padre opcional</span>
          <select
            onChange={(event) =>
              setCategoryForm((current) => ({
                ...current,
                parentId: event.target.value
              }))
            }
            value={categoryForm.parentId}
          >
            <option value="">Sin categoria padre</option>
            {categories
              .filter((category) => category.movementType === categoryForm.movementType)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <div className="account-form__actions">
          <button
            className="text-link"
            onClick={() => setCategoryForm(emptyCategoryForm)}
            type="button"
          >
            Limpiar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSaveCategory()}
            type="button"
          >
            {categoryForm.id ? 'Guardar categoria' : 'Crear categoria'}
          </ActionButton>
        </div>
      </section>

      <div className="category-groups">
        {movementGroups.map((group) => {
          const groupCategories = categories.filter(
            (category) => category.movementType === group.type
          );

          return (
            <section className="category-group" key={group.type}>
              <h3>{group.label}</h3>
              {groupCategories.length > 0 ? (
                groupCategories.map((category) => {
                  const categoryRules = rules.filter(
                    (rule) => rule.categoryId === category.id
                  );

                  return (
                    <article className="category-card" key={category.id}>
                      <div>
                        <strong>{category.name}</strong>
                        <span>
                          {category.system ? 'Sistema' : 'Personal'} ·{' '}
                          {getMovementTypeLabel(category.movementType)}
                        </span>
                      </div>
                      <small>
                        {categoryRules.length > 0
                          ? categoryRules.map((rule) => rule.keyword).join(', ')
                          : 'Sin reglas asociadas'}
                      </small>
                      {!category.system ? (
                        <div className="empty-state-actions">
                          <button
                            className="text-link"
                            onClick={() =>
                              setCategoryForm({
                                color: category.color ?? '',
                                icon: category.icon ?? '',
                                id: category.id,
                                movementType: category.movementType,
                                name: category.name,
                                parentId: category.parentId ?? ''
                              })
                            }
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="text-link"
                            disabled={isSaving}
                            onClick={() => void handleDeleteCategory(category)}
                            type="button"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="empty-state-card">
                  <span>Sin categorias</span>
                  <p>No hay categorias reales para este bloque.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="account-form" aria-label="Reglas automaticas">
        <div className="section-heading">
          <p className="eyebrow">Reglas</p>
          <span>Menor prioridad numerica significa mas prioridad.</span>
        </div>
        <label>
          <span>Keyword</span>
          <input
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, keyword: event.target.value }))
            }
            placeholder="mercadona"
            type="text"
            value={ruleForm.keyword}
          />
        </label>
        <label>
          <span>Categoria</span>
          <select
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, categoryId: event.target.value }))
            }
            value={ruleForm.categoryId}
          >
            <option value="">Selecciona categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} - {getMovementTypeLabel(category.movementType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Prioridad</span>
          <input
            min="1"
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, priority: event.target.value }))
            }
            type="number"
            value={ruleForm.priority}
          />
        </label>
        <div className="account-form__actions">
          <button
            className="text-link"
            onClick={() => setRuleForm(emptyRuleForm)}
            type="button"
          >
            Limpiar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSaveRule()}
            type="button"
          >
            {ruleForm.id ? 'Guardar regla' : 'Crear regla'}
          </ActionButton>
        </div>
        <div className="asset-list">
          {rules.map((rule) => {
            const category = categories.find(
              (candidate) => candidate.id === rule.categoryId
            );

            return (
              <article className="category-card" key={rule.id}>
                <div>
                  <strong>{rule.keyword}</strong>
                  <span>
                    {category?.name ?? 'Categoria'} - prioridad {rule.priority}
                  </span>
                </div>
                <small>{rule.workspaceId ? 'Personalizada' : 'Sistema'}</small>
                {rule.workspaceId ? (
                  <div className="empty-state-actions">
                    <button
                      className="text-link"
                      onClick={() =>
                        setRuleForm({
                          categoryId: rule.categoryId,
                          id: rule.id,
                          keyword: rule.keyword,
                          priority: String(rule.priority)
                        })
                      }
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="text-link"
                      disabled={isSaving}
                      onClick={() => void handleDeleteRule(rule)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

type AssetsPanelProps = {
  summary: DashboardSummary | null;
  onUpdated: (message: string) => void;
};

type ContainersPanelProps = {
  summary: DashboardSummary | null;
  onCreateStartingPoint: () => void;
  onUpdated: (message: string) => void;
};

type ContainerFormState = {
  id?: string;
  institution: string;
  name: string;
  containerType: ContainerType;
  currency: string;
};

type AssetFormState = {
  id?: string;
  containerId: string;
  name: string;
  assetType: AssetType;
  currentValue: string;
  currency: string;
  quantity: string;
  purchasePrice: string;
  averageCost: string;
  totalCost: string;
  purchaseDate: string;
  notes: string;
};

type AssetModalMode = 'create' | 'edit';

function ContainersPanel({
  onCreateStartingPoint,
  onUpdated,
  summary
}: ContainersPanelProps) {
  const containers = summary?.containers ?? [];
  const [editingContainer, setEditingContainer] = useState<FinancialContainer | null>(
    null
  );
  const [assetInitialContainerId, setAssetInitialContainerId] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssetCreateOpen, setIsAssetCreateOpen] = useState(false);
  const [deletingContainer, setDeletingContainer] = useState<FinancialContainer | null>(
    null
  );
  const [panelError, setPanelError] = useState<string | null>(null);

  function handleUpdated(message: string) {
    setPanelError(null);
    setEditingContainer(null);
    setAssetInitialContainerId('');
    setIsCreateOpen(false);
    setIsAssetCreateOpen(false);
    setDeletingContainer(null);
    onUpdated(message);
  }

  return (
    <section className="accounts-panel" aria-label="Cuentas y plataformas">
      <div className="section-heading accounts-heading">
        <div>
          <p className="eyebrow">Cuentas</p>
          <h2>Cuentas y plataformas</h2>
          <span>Contenedores reales de tu patrimonio</span>
        </div>
        <strong>
          {formatMoney(sumContainerValues(containers), summary?.currency ?? 'EUR')}
        </strong>
      </div>
      <div className="container-actions container-actions--top">
        <button className="text-link" onClick={() => setIsCreateOpen(true)} type="button">
          Anadir cuenta
        </button>
        {containers.length > 0 ? (
          <button
            className="text-link"
            onClick={() => setIsAssetCreateOpen(true)}
            type="button"
          >
            Anadir activo
          </button>
        ) : null}
      </div>

      {panelError ? <p className="form-status form-status--error">{panelError}</p> : null}

      {containers.length > 0 ? (
        <ContainerBreakdown
          containers={containers}
          currency={summary?.currency ?? 'EUR'}
          showActions
          onAddAsset={(container) => {
            setAssetInitialContainerId(container.id);
            setIsAssetCreateOpen(true);
          }}
          onDeleteContainer={setDeletingContainer}
          onEditContainer={setEditingContainer}
          title="Estructura patrimonial"
        />
      ) : (
        <div className="empty-state-card">
          <span>Sin cuentas ni plataformas</span>
          <p>
            Crea tu punto de partida para separar bancos, brokers, wallets y efectivo.
          </p>
          <button className="text-link" onClick={onCreateStartingPoint} type="button">
            Configurar punto de partida
          </button>
        </div>
      )}

      {isCreateOpen ? (
        <ContainerEditorModal
          currency={summary?.currency ?? 'EUR'}
          onClose={() => setIsCreateOpen(false)}
          onError={setPanelError}
          onSaved={() => handleUpdated('Cuenta creada.')}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {editingContainer ? (
        <ContainerEditorModal
          container={editingContainer}
          currency={summary?.currency ?? 'EUR'}
          onClose={() => setEditingContainer(null)}
          onError={setPanelError}
          onSaved={() => handleUpdated('Cuenta actualizada.')}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {isAssetCreateOpen ? (
        <AssetEditorModal
          containers={containers}
          initialContainerId={assetInitialContainerId || containers[0]?.id || ''}
          mode="create"
          onClose={() => {
            setIsAssetCreateOpen(false);
            setAssetInitialContainerId('');
          }}
          onError={setPanelError}
          onSaved={() => handleUpdated('Activo creado.')}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {deletingContainer ? (
        <ConfirmArchiveContainerModal
          container={deletingContainer}
          onClose={() => setDeletingContainer(null)}
          onError={setPanelError}
          onSaved={() => handleUpdated('Cuenta archivada.')}
          workspaceId={summary?.workspace.id}
        />
      ) : null}
    </section>
  );
}

function AssetsPanel({ onUpdated, summary }: AssetsPanelProps) {
  const [selectedAsset, setSelectedAsset] = useState<PatrimonyAsset | null>(null);
  const [editingAsset, setEditingAsset] = useState<PatrimonyAsset | null>(null);
  const [movingAsset, setMovingAsset] = useState<PatrimonyAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<PatrimonyAsset | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const assets = getAllContainerAssets(summary?.containers ?? []);
  const groups = groupAssetsByType(assets);
  const currency = summary?.currency ?? 'EUR';

  if (assets.length === 0) {
    return (
      <section className="empty-section" aria-label="Activos">
        <div className="section-heading">
          <p className="eyebrow">Activos</p>
          <h2>Sin activos registrados</h2>
          <span>Configura o crea activos reales para ver tu patrimonio por tipo.</span>
        </div>
        <button
          className="text-link"
          disabled={!summary?.workspace.id || summary.containers.length === 0}
          onClick={() => setIsCreateOpen(true)}
          type="button"
        >
          Anadir activo
        </button>
        {summary?.containers.length === 0 ? (
          <p className="form-status">
            Primero crea una cuenta o plataforma para alojar el activo.
          </p>
        ) : null}
        {isCreateOpen ? (
          <AssetEditorModal
            containers={summary?.containers ?? []}
            mode="create"
            onClose={() => setIsCreateOpen(false)}
            onError={setPanelError}
            onSaved={() => {
              setPanelError(null);
              setIsCreateOpen(false);
              onUpdated('Activo creado.');
            }}
            workspaceId={summary?.workspace.id}
          />
        ) : null}
        {panelError ? (
          <p className="form-status form-status--error">{panelError}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="empty-section" aria-label="Activos">
      <div className="section-heading">
        <p className="eyebrow">Activos</p>
        <h2>Mapa patrimonial</h2>
        <span>Agrupado por tipo de activo</span>
      </div>
      <button className="text-link" onClick={() => setIsCreateOpen(true)} type="button">
        Anadir activo
      </button>
      {panelError ? <p className="form-status form-status--error">{panelError}</p> : null}

      <div className="category-groups">
        {groups.map((group) => (
          <details className="container-card" key={group.type}>
            <summary>
              <div>
                <strong>{getAssetTypeLabel(group.type)}</strong>
                <span>
                  {group.assets.length} {group.assets.length === 1 ? 'activo' : 'activos'}
                </span>
              </div>
              <strong>{formatMoney(group.total, currency)}</strong>
            </summary>
            <div className="asset-list">
              {group.assets.map((asset) => (
                <button
                  className="asset-row transaction-row-button"
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  type="button"
                >
                  <div>
                    <strong>{asset.name}</strong>
                    <span>{asset.provider ?? 'Sin plataforma'}</span>
                  </div>
                  <div className="asset-performance-summary">
                    <strong>{getAssetCurrentValueLabel(asset)}</strong>
                    <small>{getAssetCostSummary(asset)}</small>
                  </div>
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>

      {selectedAsset ? (
        <AssetDetailsModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDelete={() => {
            setDeletingAsset(selectedAsset);
            setSelectedAsset(null);
          }}
          onEdit={() => {
            setEditingAsset(selectedAsset);
            setSelectedAsset(null);
          }}
          onMove={() => {
            setMovingAsset(selectedAsset);
            setSelectedAsset(null);
          }}
        />
      ) : null}

      {isCreateOpen ? (
        <AssetEditorModal
          containers={summary?.containers ?? []}
          mode="create"
          onClose={() => setIsCreateOpen(false)}
          onError={setPanelError}
          onSaved={() => {
            setPanelError(null);
            setIsCreateOpen(false);
            onUpdated('Activo creado.');
          }}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {editingAsset ? (
        <AssetEditorModal
          asset={editingAsset}
          containers={summary?.containers ?? []}
          mode="edit"
          onClose={() => setEditingAsset(null)}
          onError={setPanelError}
          onSaved={() => {
            setPanelError(null);
            setEditingAsset(null);
            onUpdated('Activo actualizado.');
          }}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {movingAsset ? (
        <MoveAssetModal
          asset={movingAsset}
          containers={summary?.containers ?? []}
          onClose={() => setMovingAsset(null)}
          onError={setPanelError}
          onSaved={() => {
            setPanelError(null);
            setMovingAsset(null);
            onUpdated('Activo movido.');
          }}
          workspaceId={summary?.workspace.id}
        />
      ) : null}

      {deletingAsset ? (
        <ConfirmArchiveAssetModal
          asset={deletingAsset}
          onClose={() => setDeletingAsset(null)}
          onError={setPanelError}
          onSaved={() => {
            setPanelError(null);
            setDeletingAsset(null);
            onUpdated('Activo archivado.');
          }}
          workspaceId={summary?.workspace.id}
        />
      ) : null}
    </section>
  );
}

function ContainerEditorModal({
  container,
  currency,
  onClose,
  onError,
  onSaved,
  workspaceId
}: {
  container?: FinancialContainer;
  currency: string;
  onClose: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  workspaceId?: string;
}) {
  const [form, setForm] = useState<ContainerFormState>(() =>
    createContainerForm(container, currency)
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (!workspaceId) {
      onError('No se ha podido identificar el workspace.');
      return;
    }

    if (!form.name.trim()) {
      onError('El nombre de la cuenta es obligatorio.');
      return;
    }

    setIsSaving(true);
    onError(null);

    try {
      await saveFinancialContainer({
        containerType: form.containerType,
        currency: form.currency || currency,
        id: form.id,
        institution: form.institution,
        name: form.name,
        workspaceId
      });
      onSaved();
    } catch (containerError) {
      onError(getErrorMessage(containerError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppModal
      closeLabel="Cerrar cuenta"
      contentClassName="account-form asset-editor-form"
      eyebrow="Cuenta"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </ActionButton>
        </>
      }
      onClose={onClose}
      subtitle="Contenedor patrimonial sin saldo propio"
      title={container ? 'Editar cuenta' : 'Anadir cuenta'}
    >
      <label>
        <span>Entidad / plataforma</span>
        <input
          onChange={(event) =>
            setForm((current) => ({ ...current, institution: event.target.value }))
          }
          placeholder="MyInvestor"
          value={form.institution}
        />
      </label>
      <label>
        <span>Nombre</span>
        <input
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="Cuenta principal"
          value={form.name}
        />
      </label>
      <label>
        <span>Tipo</span>
        <select
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              containerType: event.target.value as ContainerType
            }))
          }
          value={form.containerType}
        >
          {containerTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Moneda</span>
        <input
          maxLength={3}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              currency: event.target.value.toUpperCase()
            }))
          }
          value={form.currency}
        />
      </label>
    </AppModal>
  );
}

function AssetEditorModal({
  asset,
  containers,
  initialContainerId,
  mode,
  onClose,
  onError,
  onSaved,
  workspaceId
}: {
  asset?: PatrimonyAsset;
  containers: FinancialContainer[];
  initialContainerId?: string;
  mode: AssetModalMode;
  onClose: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  workspaceId?: string;
}) {
  const [form, setForm] = useState<AssetFormState>(() =>
    createAssetForm(asset, containers, initialContainerId)
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (!workspaceId) {
      onError('No se ha podido identificar el workspace.');
      return;
    }

    if (!form.containerId) {
      onError('Selecciona una cuenta o plataforma.');
      return;
    }

    if (!form.name.trim()) {
      onError('El nombre del activo es obligatorio.');
      return;
    }

    const quantity = parseOptionalNumber(form.quantity);
    const averageCost = parseOptionalNumber(form.averageCost);
    const explicitTotalCost = parseOptionalNumber(form.totalCost);
    const calculatedTotalCost =
      quantity !== null && averageCost !== null ? quantity * averageCost : null;
    const totalCost = explicitTotalCost ?? calculatedTotalCost;
    const currentValue = parseOptionalNumber(form.currentValue);
    const selectedContainer = containers.find(
      (container) => container.id === form.containerId
    );

    setIsSaving(true);
    onError(null);

    try {
      await savePatrimonyAsset({
        assetType: form.assetType,
        averageCost,
        containerId: form.containerId,
        currency: form.currency,
        currentValue,
        id: asset?.id,
        name: form.name,
        notes: form.notes,
        purchaseDate: form.purchaseDate || null,
        purchasePrice: parseOptionalNumber(form.purchasePrice),
        provider: selectedContainer ? getContainerLabel(selectedContainer) : null,
        quantity,
        totalCost,
        workspaceId
      });
      onSaved();
    } catch (assetError) {
      onError(getErrorMessage(assetError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppModal
      closeLabel="Cerrar activo"
      contentClassName="account-form asset-editor-form"
      eyebrow="Activo"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </ActionButton>
        </>
      }
      onClose={onClose}
      subtitle="El valor actual se guarda como valoracion manual"
      title={mode === 'edit' ? 'Editar activo' : 'Anadir activo'}
    >
      <label>
        <span>Cuenta / plataforma</span>
        <select
          onChange={(event) =>
            setForm((current) => ({ ...current, containerId: event.target.value }))
          }
          value={form.containerId}
        >
          <option value="">Selecciona cuenta</option>
          {containers.map((container) => (
            <option key={container.id} value={container.id}>
              {getContainerLabel(container)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Nombre del activo</span>
        <input
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          placeholder="Fidelity MSCI World"
          value={form.name}
        />
      </label>
      <label>
        <span>Tipo</span>
        <select
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              assetType: event.target.value as AssetType
            }))
          }
          value={form.assetType}
        >
          {assetTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Valor actual</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            setForm((current) => ({ ...current, currentValue: event.target.value }))
          }
          placeholder="Valor pendiente si lo dejas vacio"
          value={form.currentValue}
        />
      </label>
      <label>
        <span>Moneda</span>
        <input
          maxLength={3}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              currency: event.target.value.toUpperCase()
            }))
          }
          value={form.currency}
        />
      </label>
      <div className="asset-editor-section">
        <strong>Datos de compra</strong>
        <span>Opcionales para calcular beneficio y rentabilidad.</span>
      </div>
      <label>
        <span>Cantidad</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            setForm((current) => ({ ...current, quantity: event.target.value }))
          }
          value={form.quantity}
        />
      </label>
      <label>
        <span>Precio medio de compra</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            setForm((current) => ({ ...current, averageCost: event.target.value }))
          }
          value={form.averageCost}
        />
      </label>
      <label>
        <span>Coste total invertido</span>
        <input
          inputMode="decimal"
          onChange={(event) =>
            setForm((current) => ({ ...current, totalCost: event.target.value }))
          }
          value={form.totalCost}
        />
      </label>
      <label>
        <span>Fecha de compra aproximada</span>
        <input
          onChange={(event) =>
            setForm((current) => ({ ...current, purchaseDate: event.target.value }))
          }
          type="date"
          value={form.purchaseDate}
        />
      </label>
      <label>
        <span>Notas</span>
        <textarea
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          value={form.notes}
        />
      </label>
    </AppModal>
  );
}

function MoveAssetModal({
  asset,
  containers,
  onClose,
  onError,
  onSaved,
  workspaceId
}: {
  asset: PatrimonyAsset;
  containers: FinancialContainer[];
  onClose: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  workspaceId?: string;
}) {
  const [containerId, setContainerId] = useState(asset.containerId ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleMove() {
    if (!workspaceId) {
      onError('No se ha podido identificar el workspace.');
      return;
    }

    if (!containerId) {
      onError('Selecciona la cuenta destino.');
      return;
    }

    setIsSaving(true);
    onError(null);

    try {
      await movePatrimonyAsset({
        assetId: asset.id,
        containerId,
        workspaceId
      });
      onSaved();
    } catch (moveError) {
      onError(getErrorMessage(moveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppModal
      closeLabel="Cerrar mover activo"
      contentClassName="account-form"
      eyebrow="Mover activo"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleMove()}
            type="button"
          >
            {isSaving ? 'Moviendo...' : 'Mover'}
          </ActionButton>
        </>
      }
      onClose={onClose}
      subtitle={asset.name}
      title="Cambiar cuenta destino"
    >
      <label>
        <span>Cuenta / plataforma</span>
        <select
          onChange={(event) => setContainerId(event.target.value)}
          value={containerId}
        >
          <option value="">Selecciona cuenta</option>
          {containers.map((container) => (
            <option key={container.id} value={container.id}>
              {getContainerLabel(container)}
            </option>
          ))}
        </select>
      </label>
    </AppModal>
  );
}

function ConfirmArchiveAssetModal({
  asset,
  onClose,
  onError,
  onSaved,
  workspaceId
}: {
  asset: PatrimonyAsset;
  onClose: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  workspaceId?: string;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function handleArchive() {
    if (!workspaceId) {
      onError('No se ha podido identificar el workspace.');
      return;
    }

    setIsSaving(true);
    onError(null);

    try {
      await archivePatrimonyAsset({ assetId: asset.id, workspaceId });
      onSaved();
    } catch (archiveError) {
      onError(getErrorMessage(archiveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppModal
      closeLabel="Cerrar eliminacion"
      eyebrow="Eliminar"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleArchive()}
            type="button"
          >
            {isSaving ? 'Archivando...' : 'Archivar activo'}
          </ActionButton>
        </>
      }
      onClose={onClose}
      subtitle="No se borra fisicamente: queda archivado con deleted_at."
      title={asset.name}
    >
      <p className="modal-copy">
        Este activo dejara de aparecer en Cuentas y Activos, pero el registro se conserva
        para mantener trazabilidad.
      </p>
    </AppModal>
  );
}

function ConfirmArchiveContainerModal({
  container,
  onClose,
  onError,
  onSaved,
  workspaceId
}: {
  container: FinancialContainer;
  onClose: () => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  workspaceId?: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const hasAssets = container.assets.length > 0;

  async function handleArchive() {
    if (!workspaceId) {
      onError('No se ha podido identificar el workspace.');
      return;
    }

    setIsSaving(true);
    onError(null);

    try {
      await archiveFinancialContainer({
        containerId: container.id,
        workspaceId
      });
      onSaved();
    } catch (archiveError) {
      onError(getErrorMessage(archiveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppModal
      closeLabel="Cerrar eliminacion"
      eyebrow="Eliminar cuenta"
      footer={
        <>
          <button
            className="text-link"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleArchive()}
            type="button"
          >
            {isSaving ? 'Archivando...' : 'Archivar cuenta'}
          </ActionButton>
        </>
      }
      onClose={onClose}
      subtitle="Se archivara con deleted_at, no se eliminara fisicamente."
      title={getContainerLabel(container)}
    >
      <p className="modal-copy">
        Esta cuenta dejara de mostrarse en la app. Si tiene movimientos importados o
        activos asociados, se conserva el historico y no se borra informacion financiera.
      </p>
      {hasAssets ? (
        <p className="form-status form-status--error">
          Contiene {container.assets.length}{' '}
          {container.assets.length === 1 ? 'activo asociado' : 'activos asociados'}.
          Archivar la cuenta tambien ocultara esos activos de la vista agrupada.
        </p>
      ) : null}
    </AppModal>
  );
}

function AssetDetailsModal({
  asset,
  onClose,
  onDelete,
  onEdit,
  onMove
}: {
  asset: PatrimonyAsset;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: () => void;
}) {
  const performance = getAssetPerformance(asset);

  return (
    <AppModal
      className="asset-detail-modal"
      closeLabel="Cerrar detalle de activo"
      eyebrow="Activo"
      footer={
        <>
          <button className="text-link" onClick={onEdit} type="button">
            Editar
          </button>
          <button className="text-link" onClick={onMove} type="button">
            Mover activo
          </button>
          <button className="text-link" onClick={onDelete} type="button">
            Eliminar
          </button>
          <button className="text-link" onClick={onClose} type="button">
            Cerrar
          </button>
        </>
      }
      onClose={onClose}
      subtitle={`${asset.provider ?? 'Sin plataforma'} - ${getAssetTypeLabel(asset.assetType)}`}
      title={asset.name}
    >
      <div className="asset-detail-grid">
        <MetricCard label="Valor actual" value={getAssetCurrentValueLabel(asset)} />
        <MetricCard
          label="Coste total"
          value={
            performance.totalCost === null
              ? 'Coste no informado'
              : formatMoney(performance.totalCost, asset.currency)
          }
        />
        <MetricCard
          label="Beneficio"
          value={
            !hasAssetCurrentValue(asset)
              ? 'Valor pendiente'
              : asset.currentValueIsEstimated
                ? 'Valor estimado por coste'
                : performance.profit === null
                  ? 'Coste no informado'
                  : formatMoney(performance.profit, asset.currency)
          }
        />
        <MetricCard
          label="Rentabilidad"
          value={
            !hasAssetCurrentValue(asset)
              ? 'Valor pendiente'
              : asset.currentValueIsEstimated
                ? 'Valor estimado por coste'
                : performance.returnPercentage === null
                  ? 'Coste no informado'
                  : formatPercentage(performance.returnPercentage)
          }
        />
      </div>

      <div className="asset-detail-list">
        <span>Cantidad: {asset.quantity ?? 'No informada'}</span>
        <span>
          Precio medio:{' '}
          {asset.averageCost === null
            ? 'No informado'
            : formatMoney(asset.averageCost, asset.currency)}
        </span>
        <span>
          Fecha de compra:{' '}
          {asset.purchaseDate ? formatDate(asset.purchaseDate) : 'No informada'}
        </span>
        <span>Notas: {asset.notes ?? 'Sin notas'}</span>
      </div>
    </AppModal>
  );
}

function ContainerBreakdown({
  containers,
  currency,
  onAddAsset,
  onDeleteContainer,
  onEditContainer,
  showActions = false,
  title
}: {
  containers: FinancialContainer[];
  currency: string;
  onAddAsset?: (container: FinancialContainer) => void;
  onDeleteContainer?: (container: FinancialContainer) => void;
  onEditContainer?: (container: FinancialContainer) => void;
  showActions?: boolean;
  title: string;
}) {
  if (containers.length === 0) {
    return null;
  }

  return (
    <section className="snapshot-group-block">
      <h3>{title}</h3>
      <div className="container-list">
        {containers.map((container) => (
          <details className="container-card" key={container.id}>
            <summary>
              <div>
                <strong>{getContainerLabel(container)}</strong>
                <span>
                  {getContainerTypeLabel(container.containerType)} ·{' '}
                  {container.assets.length}{' '}
                  {container.assets.length === 1 ? 'activo' : 'activos'}
                </span>
              </div>
              <strong>{formatMoney(container.totalValue, currency)}</strong>
            </summary>

            {container.assets.length > 0 ? (
              <div className="asset-list">
                {container.assets.map((asset) => (
                  <article className="asset-row" key={asset.id}>
                    <div>
                      <strong>{asset.name}</strong>
                      <span>{getAssetTypeLabel(asset.assetType)}</span>
                    </div>
                    <div className="asset-performance-summary">
                      <strong>{getAssetCurrentValueLabel(asset)}</strong>
                      <small>{getAssetCostSummary(asset)}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <span>Sin activos dentro</span>
                <p>Este contenedor existe, pero todavia no tiene activos asociados.</p>
              </div>
            )}

            {showActions ? (
              <div className="container-actions" aria-label="Gestion del contenedor">
                <button
                  className="text-link"
                  onClick={() => onEditContainer?.(container)}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="text-link"
                  onClick={() => onAddAsset?.(container)}
                  type="button"
                >
                  Anadir activo
                </button>
                <button
                  className="text-link"
                  onClick={() => onDeleteContainer?.(container)}
                  type="button"
                >
                  Eliminar
                </button>
              </div>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}

type SnapshotPanelProps = {
  summary: DashboardSummary | null;
  onBack: () => void;
  onSaved: () => void;
};

type SnapshotFormState = {
  mode: 'today' | 'historical';
  snapshotDate: string;
  notes: string;
  containers: DraftContainer[];
  assets: DraftAsset[];
  debts: DraftAsset[];
};

type DraftContainer = CreateStartingPointContainerInput & {
  localId: string;
};

type DraftAsset = Omit<CreateStartingPointAssetInput, 'value' | 'quantity'> & {
  localId: string;
  valueInput: string;
  quantityInput: string;
  averageCostInput: string;
  totalCostInput: string;
  purchaseDate: string;
};

const containerTypes = [
  { value: 'bank', label: 'Banco' },
  { value: 'broker', label: 'Broker' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'other', label: 'Otro' }
] satisfies Array<{ value: ContainerType; label: string }>;

const assetTypes = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'fund', label: 'Fondo' },
  { value: 'etf', label: 'ETF' },
  { value: 'stock', label: 'Accion' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'vehicle', label: 'Vehiculo' },
  { value: 'gold', label: 'Oro' },
  { value: 'other', label: 'Otro activo' }
] satisfies Array<{ value: AssetType; label: string }>;

function SnapshotPanel({ onBack, onSaved, summary }: SnapshotPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [stepIndex, setStepIndex] = useState(0);
  const [formState, setFormState] = useState<SnapshotFormState>({
    assets: [createDraftAsset(summary?.currency ?? 'EUR')],
    containers: [createDraftContainer(summary?.currency ?? 'EUR')],
    debts: [],
    mode: 'today',
    notes: '',
    snapshotDate: today
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = summary?.currency ?? 'EUR';
  const totals = getStartingPointTotals(formState.assets, formState.debts);

  if (summary?.snapshot) {
    return (
      <section className="accounts-panel" aria-label="Punto de partida patrimonial">
        <button className="text-link csv-import-back" onClick={onBack} type="button">
          Volver al dashboard
        </button>

        <div className="section-heading">
          <p className="eyebrow">Punto de partida</p>
          <h2>Fotografia inicial</h2>
          <span>{formatDate(summary.snapshot.snapshotDate)}</span>
        </div>

        <section className="snapshot-summary-grid">
          <MetricCard
            label="Patrimonio bruto inicial"
            value={formatMoney(summary.snapshot.initialGrossWorth, summary.currency)}
          />
          <MetricCard
            label="Deudas iniciales"
            value={formatMoney(summary.snapshot.initialDebt, summary.currency)}
          />
          <MetricCard
            label="Patrimonio neto inicial"
            value={formatMoney(summary.snapshot.initialNetWorth, summary.currency)}
          />
          <MetricCard
            label="Elementos"
            value={String(summary.snapshot.items.length)}
            hint="Cuentas, activos y deudas"
          />
        </section>

        <SnapshotGroups
          currency={summary.currency}
          groups={summary.snapshot.groupedByType}
          title="Agrupado por tipo de activo"
        />

        <SnapshotGroups
          currency={summary.currency}
          groups={summary.snapshot.groupedByPlatform}
          title="Agrupado por entidad o plataforma"
        />

        <div className="asset-list">
          {summary.snapshot.items.map((item) => (
            <article className="asset-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.platform ?? 'Manual'} · {getSnapshotTypeLabel(item.type)}
                </span>
              </div>
              <div>
                <strong>{formatMoney(item.value, item.currency)}</strong>
                <small>{item.currency}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  async function handleSave() {
    setError(null);

    if (!summary) {
      setError('No se encontro un workspace activo.');
      return;
    }

    const containers = formState.containers
      .map((item) => ({
        containerType: item.containerType,
        currency: item.currency.trim().toUpperCase(),
        institution: item.institution?.trim() || item.name.trim(),
        localId: item.localId,
        name: item.name.trim()
      }))
      .filter((item) => item.name);
    const assets = formState.assets
      .map((item) => {
        const quantity = parseOptionalNumber(item.quantityInput);
        const averageCost = parseOptionalNumber(item.averageCostInput);

        return {
          assetType: item.assetType,
          averageCost,
          containerLocalId: item.containerLocalId || null,
          currency: item.currency.trim().toUpperCase(),
          name: item.name.trim(),
          notes: item.notes?.trim() || null,
          purchaseDate: item.purchaseDate || null,
          purchasePrice: averageCost,
          quantity,
          totalCost: getDraftAssetTotalCost(item),
          value: Math.abs(Number(item.valueInput))
        };
      })
      .filter((item) => item.name && Number.isFinite(item.value));
    const debts = formState.debts
      .map((item) => ({
        assetType: 'liability' as const,
        containerLocalId: null,
        currency: item.currency.trim().toUpperCase(),
        name: item.name.trim(),
        notes: item.notes?.trim() || null,
        purchaseDate: null,
        purchasePrice: null,
        quantity: null,
        averageCost: null,
        totalCost: null,
        value: Math.abs(Number(item.valueInput))
      }))
      .filter((item) => item.name && Number.isFinite(item.value));

    if (containers.length === 0) {
      setError('Anade al menos una cuenta o plataforma.');
      return;
    }

    if (assets.length === 0 && debts.length === 0) {
      setError('Anade al menos un activo o una deuda.');
      return;
    }

    if (assets.some((asset) => !asset.containerLocalId)) {
      setError('Asigna cada activo a una cuenta o plataforma.');
      return;
    }

    setIsSaving(true);

    try {
      await createPatrimonialStartingPoint({
        assets,
        containers,
        debts,
        name: 'Punto de partida',
        notes: formState.notes.trim() || null,
        snapshotDate: formState.snapshotDate,
        workspaceId: summary.workspace.id
      });
      onSaved();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="accounts-panel" aria-label="Snapshot patrimonial">
      <button className="text-link csv-import-back" onClick={onBack} type="button">
        Volver al dashboard
      </button>

      <div className="section-heading">
        <p className="eyebrow">Punto de partida</p>
        <h2>Define tu punto de partida</h2>
        <span>
          Para que Capitalia calcule bien tu patrimonio, necesitamos una fotografia
          inicial de tus cuentas, inversiones, activos y deudas.
        </span>
      </div>

      <div className="empty-state-card">
        <span>No pongas una sola cantidad.</span>
        <p>Anade cada cuenta o activo por separado.</p>
      </div>

      {error ? <p className="auth-message auth-message--error">{error}</p> : null}

      <form className="account-form">
        <div className="wizard-steps" aria-label="Pasos del punto de partida">
          {wizardSteps.map((step, index) => (
            <button
              className={
                stepIndex === index ? 'wizard-step wizard-step--active' : 'wizard-step'
              }
              key={step}
              onClick={() => setStepIndex(index)}
              type="button"
            >
              {index + 1}. {step}
            </button>
          ))}
        </div>

        {stepIndex === 0 ? (
          <div className="snapshot-step">
            <div>
              <strong>Desde cuando quieres empezar?</strong>
              <p>
                Si eliges una fecha pasada, importa despues movimientos desde esa fecha
                para que todo cuadre.
              </p>
            </div>
            <div className="snapshot-mode-grid">
              <button
                className={
                  formState.mode === 'today'
                    ? 'snapshot-mode snapshot-mode--active'
                    : 'snapshot-mode'
                }
                onClick={() =>
                  setFormState((current) => ({
                    ...current,
                    mode: 'today',
                    snapshotDate: today
                  }))
                }
                type="button"
              >
                Empezar desde hoy
              </button>
              <button
                className={
                  formState.mode === 'historical'
                    ? 'snapshot-mode snapshot-mode--active'
                    : 'snapshot-mode'
                }
                onClick={() =>
                  setFormState((current) => ({
                    ...current,
                    mode: 'historical'
                  }))
                }
                type="button"
              >
                Reconstruir desde otra fecha
              </button>
            </div>
            <label>
              <span>Fecha de inicio</span>
              <input
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    snapshotDate: event.target.value
                  }))
                }
                type="date"
                value={formState.snapshotDate}
              />
            </label>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <ContainerStep
            currency={currency}
            items={formState.containers}
            setFormState={setFormState}
          />
        ) : null}

        {stepIndex === 2 ? (
          <AssetStep
            containers={formState.containers}
            currency={currency}
            items={formState.assets}
            setFormState={setFormState}
          />
        ) : null}

        {stepIndex === 3 ? (
          <DebtStep
            currency={currency}
            items={formState.debts}
            setFormState={setFormState}
          />
        ) : null}

        {stepIndex === 4 ? (
          <div className="snapshot-step">
            <div>
              <strong>Resumen</strong>
              <p>Revisa tu fotografia inicial antes de guardarla.</p>
            </div>
            <div className="snapshot-summary-grid">
              <MetricCard
                label="Cuentas"
                value={String(formState.containers.filter((item) => item.name).length)}
              />
              <MetricCard
                label="Activos registrados"
                value={String(formState.assets.filter((item) => item.name).length)}
              />
              <MetricCard
                label="Deudas registradas"
                value={String(formState.debts.filter((item) => item.name).length)}
              />
              <MetricCard
                label="Patrimonio bruto"
                value={formatMoney(totals.grossWorth, currency)}
              />
              <MetricCard
                label="Deudas"
                value={`-${formatMoney(totals.debt, currency)}`}
              />
              <MetricCard
                label="Patrimonio neto inicial"
                value={formatMoney(totals.netWorth, currency)}
              />
            </div>
            <ActionButton
              disabled={isSaving}
              onClick={() => void handleSave()}
              type="button"
            >
              {isSaving ? 'Guardando...' : 'Comenzar'}
            </ActionButton>
          </div>
        ) : null}

        <div className="account-form__actions">
          <button
            className="text-link"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
            type="button"
          >
            Anterior
          </button>
          {stepIndex < wizardSteps.length - 1 ? (
            <ActionButton
              onClick={() =>
                setStepIndex((current) => Math.min(current + 1, wizardSteps.length - 1))
              }
              type="button"
            >
              Continuar
            </ActionButton>
          ) : null}
        </div>
      </form>
    </section>
  );
}

type SnapshotItemStepProps = {
  setFormState: Dispatch<SetStateAction<SnapshotFormState>>;
};

function SnapshotGroups({
  currency,
  groups,
  title
}: {
  currency: string;
  groups: Array<{ key: string; label: string; total: number; itemCount: number }>;
  title: string;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="snapshot-group-block">
      <h3>{title}</h3>
      <div className="asset-list">
        {groups.map((group) => (
          <article className="account-row" key={group.key}>
            <div>
              <strong>{getSnapshotGroupLabel(group.label)}</strong>
              <span>
                {group.itemCount} {group.itemCount === 1 ? 'elemento' : 'elementos'}
              </span>
            </div>
            <div>
              <strong>{formatMoney(group.total, currency)}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContainerStep({
  currency,
  items,
  setFormState
}: SnapshotItemStepProps & {
  currency: string;
  items: DraftContainer[];
}) {
  return (
    <div className="snapshot-step">
      <div>
        <strong>Donde guardas tu patrimonio?</strong>
        <p>
          Anade bancos, brokers, wallets, exchanges o efectivo. No pongas importes aqui.
        </p>
      </div>

      {items.map((item, index) => (
        <div className="snapshot-item-row" key={item.localId}>
          <label>
            <span>Entidad / plataforma</span>
            <input
              onChange={(event) =>
                updateDraftContainer(setFormState, item.localId, {
                  institution: event.target.value
                })
              }
              placeholder={['BBVA', 'MyInvestor', 'Ledger', 'Efectivo'][index % 4]}
              type="text"
              value={item.institution ?? ''}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              onChange={(event) =>
                updateDraftContainer(setFormState, item.localId, {
                  name: event.target.value
                })
              }
              placeholder={
                ['Cuenta principal', 'MyInvestor', 'Ledger', 'Cash'][index % 4]
              }
              type="text"
              value={item.name}
            />
          </label>
          <label>
            <span>Tipo</span>
            <select
              onChange={(event) =>
                updateDraftContainer(setFormState, item.localId, {
                  containerType: event.target.value as ContainerType
                })
              }
              value={item.containerType}
            >
              {containerTypes.map((type) => (
                <option key={`${type.value}-${type.label}`} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}

      <button
        className="text-link"
        onClick={() =>
          setFormState((current) => ({
            ...current,
            containers: [...current.containers, createDraftContainer(currency)]
          }))
        }
        type="button"
      >
        Anadir cuenta o plataforma
      </button>
    </div>
  );
}

function AssetStep({
  containers,
  currency,
  items,
  setFormState
}: SnapshotItemStepProps & {
  containers: DraftContainer[];
  currency: string;
  items: DraftAsset[];
}) {
  return (
    <div className="snapshot-step">
      <div>
        <strong>Que activos tienes?</strong>
        <p>Asigna cada activo a su cuenta o plataforma para no perder detalle.</p>
      </div>

      {items.map((item, index) => (
        <AssetDraftRow
          containers={containers}
          item={item}
          key={item.localId}
          placeholder={
            ['Efectivo', 'Fidelity MSCI World', 'ETF MSCI World', 'Bitcoin'][index % 4] ??
            'Activo'
          }
          setFormState={setFormState}
        />
      ))}

      <button
        className="text-link"
        onClick={() =>
          setFormState((current) => ({
            ...current,
            assets: [...current.assets, createDraftAsset(currency)]
          }))
        }
        type="button"
      >
        Anadir activo
      </button>
    </div>
  );
}

function DebtStep({
  currency,
  items,
  setFormState
}: SnapshotItemStepProps & {
  currency: string;
  items: DraftAsset[];
}) {
  return (
    <div className="snapshot-step">
      <div>
        <strong>Tienes deudas?</strong>
        <p>
          Introduce importes positivos. Capitalia los guardara internamente como deuda.
        </p>
      </div>

      {items.map((item, index) => (
        <AssetDraftRow
          item={item}
          key={item.localId}
          placeholder={
            ['Hipoteca', 'Prestamo coche', 'Tarjeta financiada'][index % 3] ?? 'Deuda'
          }
          setFormState={setFormState}
          variant="debt"
        />
      ))}

      <button
        className="text-link"
        onClick={() =>
          setFormState((current) => ({
            ...current,
            debts: [...current.debts, createDraftDebt(currency)]
          }))
        }
        type="button"
      >
        Anadir deuda
      </button>
    </div>
  );
}

function AssetDraftRow({
  containers = [],
  item,
  placeholder,
  setFormState,
  variant = 'asset'
}: {
  containers?: DraftContainer[];
  item: DraftAsset;
  placeholder: string;
  setFormState: Dispatch<SetStateAction<SnapshotFormState>>;
  variant?: 'asset' | 'debt';
}) {
  return (
    <div className="snapshot-item-row">
      <label>
        <span>Nombre</span>
        <input
          onChange={(event) =>
            updateDraftAsset(setFormState, item.localId, variant, {
              name: event.target.value
            })
          }
          placeholder={placeholder}
          type="text"
          value={item.name}
        />
      </label>

      {variant === 'asset' ? (
        <>
          <label>
            <span>Cuenta / plataforma</span>
            <select
              onChange={(event) =>
                updateDraftAsset(setFormState, item.localId, variant, {
                  containerLocalId: event.target.value || null
                })
              }
              value={item.containerLocalId ?? ''}
            >
              <option disabled value="">
                Selecciona una cuenta
              </option>
              {containers
                .filter((container) => container.name)
                .map((container) => (
                  <option key={container.localId} value={container.localId}>
                    {getDraftContainerLabel(container)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select
              onChange={(event) =>
                updateDraftAsset(setFormState, item.localId, variant, {
                  assetType: event.target.value as AssetType
                })
              }
              value={item.assetType}
            >
              {assetTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <div className="account-form__grid">
        <label>
          <span>{variant === 'debt' ? 'Importe pendiente' : 'Valor inicial'}</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              updateDraftAsset(setFormState, item.localId, variant, {
                valueInput: event.target.value
              })
            }
            placeholder="0"
            step="0.01"
            type="number"
            value={item.valueInput}
          />
        </label>
        <label>
          <span>Moneda</span>
          <input
            maxLength={3}
            onChange={(event) =>
              updateDraftAsset(setFormState, item.localId, variant, {
                currency: event.target.value.toUpperCase()
              })
            }
            type="text"
            value={item.currency}
          />
        </label>
      </div>

      {variant === 'asset' ? (
        <section className="purchase-data-block" aria-label="Datos de compra">
          <div>
            <strong>Datos de compra</strong>
            <p>Opcional. Sirve para calcular beneficio y rentabilidad.</p>
          </div>
          <div className="account-form__grid">
            <label>
              <span>Cantidad</span>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  updateDraftAsset(setFormState, item.localId, variant, {
                    quantityInput: event.target.value
                  })
                }
                placeholder="0"
                step="0.000001"
                type="number"
                value={item.quantityInput}
              />
            </label>
            <label>
              <span>Precio medio de compra</span>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  updateDraftAsset(setFormState, item.localId, variant, {
                    averageCostInput: event.target.value
                  })
                }
                placeholder="0"
                step="0.01"
                type="number"
                value={item.averageCostInput}
              />
            </label>
          </div>
          <div className="account-form__grid">
            <label>
              <span>Coste total invertido</span>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  updateDraftAsset(setFormState, item.localId, variant, {
                    totalCostInput: event.target.value
                  })
                }
                placeholder={
                  getDraftAssetTotalCost(item)
                    ? String(getDraftAssetTotalCost(item))
                    : '0'
                }
                step="0.01"
                type="number"
                value={item.totalCostInput}
              />
            </label>
            <label>
              <span>Fecha de compra aproximada</span>
              <input
                onChange={(event) =>
                  updateDraftAsset(setFormState, item.localId, variant, {
                    purchaseDate: event.target.value
                  })
                }
                type="date"
                value={item.purchaseDate}
              />
            </label>
          </div>
        </section>
      ) : null}

      <label>
        <span>Notas opcionales</span>
        <input
          onChange={(event) =>
            updateDraftAsset(setFormState, item.localId, variant, {
              notes: event.target.value
            })
          }
          type="text"
          value={item.notes ?? ''}
        />
      </label>
    </div>
  );
}

type SettingsPanelProps = {
  summary: DashboardSummary | null;
  onOpenSnapshot: () => void;
  onRedoStartingPoint: () => void;
  onReset: (message: string) => void;
};

function SettingsPanel({
  onOpenSnapshot,
  onRedoStartingPoint,
  onReset,
  summary
}: SettingsPanelProps) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(
    summary?.workspace ?? null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRedoModalOpen, setIsRedoModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [redoConfirmation, setRedoConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isRedoingSnapshot, setIsRedoingSnapshot] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(!summary?.workspace);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (summary?.workspace) {
      setWorkspace(summary.workspace);
      setIsLoadingWorkspace(false);
      return;
    }

    void loadWorkspaceForSettings();
  }, [summary?.workspace]);

  async function loadWorkspaceForSettings() {
    setIsLoadingWorkspace(true);
    setError(null);

    try {
      setWorkspace(await getCurrentWorkspace());
    } catch (workspaceError) {
      setError(getErrorMessage(workspaceError));
    } finally {
      setIsLoadingWorkspace(false);
    }
  }

  async function handleReset() {
    setError(null);

    if (!workspace) {
      setError('No se encontro un workspace activo.');
      return;
    }

    if (confirmation !== 'RESET CAPITALIA') {
      setError('Escribe RESET CAPITALIA para confirmar.');
      return;
    }

    setIsResetting(true);

    try {
      await resetWorkspaceFinancialData(workspace.id);
      setConfirmation('');
      setIsModalOpen(false);
      onReset('Datos financieros reseteados. Tu usuario y workspace siguen intactos.');
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setIsResetting(false);
    }
  }

  async function handleRedoStartingPoint() {
    setError(null);

    if (!workspace) {
      setError('No se encontro un workspace activo.');
      return;
    }

    if (redoConfirmation !== 'REHACER PUNTO') {
      setError('Escribe REHACER PUNTO para confirmar.');
      return;
    }

    setIsRedoingSnapshot(true);

    try {
      await resetPatrimonialStartingPoint(workspace.id);
      setRedoConfirmation('');
      setIsRedoModalOpen(false);
      onRedoStartingPoint();
    } catch (redoError) {
      setError(getErrorMessage(redoError));
    } finally {
      setIsRedoingSnapshot(false);
    }
  }

  return (
    <section className="empty-section" aria-label="Ajustes">
      <div className="section-heading">
        <p className="eyebrow">Ajustes</p>
        <h2>Cuenta y seguridad</h2>
        <span>{workspace?.name ?? 'Workspace personal'}</span>
      </div>

      {isLoadingWorkspace ? (
        <p className="panel-status">Preparando ajustes del workspace...</p>
      ) : null}
      {error ? <p className="auth-message auth-message--error">{error}</p> : null}

      <section className="settings-card">
        <div>
          <span>Punto de partida patrimonial</span>
          {summary?.snapshot ? (
            <p>
              Fecha de inicio: {formatDate(summary.snapshot.snapshotDate)}. Elementos:{' '}
              {summary.snapshot.items.length}. Patrimonio neto inicial:{' '}
              {formatMoney(summary.snapshot.initialNetWorth, summary.currency)}.
            </p>
          ) : (
            <p>No tienes punto de partida patrimonial configurado.</p>
          )}
        </div>
        <div className="empty-state-actions">
          <button className="text-link" onClick={onOpenSnapshot} type="button">
            Ver punto de partida
          </button>
          <button
            className="text-link"
            disabled={!summary?.snapshot}
            onClick={() => setIsRedoModalOpen(true)}
            type="button"
          >
            Rehacer punto de partida
          </button>
        </div>
      </section>

      <section className="danger-zone">
        <div>
          <span>Zona peligrosa</span>
          <p>
            Borra todos los datos financieros de este workspace para empezar de cero. No
            borra tu usuario ni tu workspace.
          </p>
        </div>
        <button
          className="danger-button"
          disabled={!workspace || isLoadingWorkspace}
          onClick={() => setIsModalOpen(true)}
          type="button"
        >
          Resetear datos financieros
        </button>
      </section>

      {isModalOpen ? (
        <AppModal
          className="danger-modal"
          closeLabel="Cerrar reset financiero"
          eyebrow="Confirmacion"
          footer={
            <>
              <button
                className="text-link"
                disabled={isResetting}
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={isResetting || confirmation !== 'RESET CAPITALIA'}
                onClick={() => void handleReset()}
                type="button"
              >
                {isResetting ? 'Reseteando...' : 'Confirmar reset'}
              </button>
            </>
          }
          onClose={() => setIsModalOpen(false)}
          subtitle="Esta accion no borra tu usuario ni workspace."
          title="Reset financiero"
        >
          <p>
            Se borraran movimientos, balances, cuentas financieras, reglas personalizadas,
            activos, precios y snapshots. Para confirmar, escribe exactamente RESET
            CAPITALIA.
          </p>
          <input
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="RESET CAPITALIA"
            type="text"
            value={confirmation}
          />
        </AppModal>
      ) : null}

      {isRedoModalOpen ? (
        <AppModal
          className="danger-modal"
          closeLabel="Cerrar rehacer punto de partida"
          eyebrow="Punto de partida"
          footer={
            <>
              <button
                className="text-link"
                disabled={isRedoingSnapshot}
                onClick={() => setIsRedoModalOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={isRedoingSnapshot || redoConfirmation !== 'REHACER PUNTO'}
                onClick={() => void handleRedoStartingPoint()}
                type="button"
              >
                {isRedoingSnapshot ? 'Preparando...' : 'Rehacer punto'}
              </button>
            </>
          }
          onClose={() => setIsRedoModalOpen(false)}
          subtitle="No borra movimientos ni categorias."
          title="Rehacer configuracion"
        >
          <p>
            Se borraran solo los registros del snapshot inicial. Las cuentas y activos
            creados seguiran disponibles hasta el reset financiero completo. Para
            confirmar, escribe exactamente REHACER PUNTO.
          </p>
          <input
            onChange={(event) => setRedoConfirmation(event.target.value)}
            placeholder="REHACER PUNTO"
            type="text"
            value={redoConfirmation}
          />
        </AppModal>
      ) : null}
    </section>
  );
}

const movementGroups = [
  { label: 'Ingresos', type: 'income' },
  { label: 'Gastos reales', type: 'expense' },
  { label: 'Inversiones', type: 'investment' },
  { label: 'Transferencias', type: 'transfer' }
] satisfies { label: string; type: MovementType }[];

const wizardSteps = ['Fecha', 'Cuentas', 'Activos', 'Deudas', 'Resumen'] as const;

function createDraftContainer(currency: string) {
  return {
    containerType: 'bank',
    currency,
    institution: '',
    localId: crypto.randomUUID(),
    name: ''
  } satisfies DraftContainer;
}

function createDraftAsset(currency: string) {
  return {
    assetType: 'fund',
    averageCostInput: '',
    containerLocalId: null,
    currency,
    localId: crypto.randomUUID(),
    name: '',
    notes: '',
    purchaseDate: '',
    quantityInput: '',
    totalCostInput: '',
    valueInput: ''
  } satisfies DraftAsset;
}

function createDraftDebt(currency: string) {
  return {
    assetType: 'liability',
    averageCostInput: '',
    containerLocalId: null,
    currency,
    localId: crypto.randomUUID(),
    name: '',
    notes: '',
    purchaseDate: '',
    quantityInput: '',
    totalCostInput: '',
    valueInput: ''
  } satisfies DraftAsset;
}

function updateDraftContainer(
  setFormState: Dispatch<SetStateAction<SnapshotFormState>>,
  localId: string,
  patch: Partial<DraftContainer>
) {
  setFormState((current) => ({
    ...current,
    containers: current.containers.map((item) =>
      item.localId === localId ? { ...item, ...patch } : item
    )
  }));
}

function updateDraftAsset(
  setFormState: Dispatch<SetStateAction<SnapshotFormState>>,
  localId: string,
  variant: 'asset' | 'debt',
  patch: Partial<DraftAsset>
) {
  const key = variant === 'asset' ? 'assets' : 'debts';

  setFormState((current) => ({
    ...current,
    [key]: current[key].map((item) =>
      item.localId === localId ? { ...item, ...patch } : item
    )
  }));
}

function getStartingPointTotals(assets: DraftAsset[], debts: DraftAsset[]) {
  const grossWorth = sumDraftAssets(assets);
  const debt = sumDraftAssets(debts);

  return {
    debt,
    grossWorth,
    netWorth: grossWorth - debt
  };
}

function sumDraftAssets(items: DraftAsset[]) {
  return items.reduce((total, item) => {
    const value = Number(item.valueInput);

    return Number.isFinite(value) ? total + Math.abs(value) : total;
  }, 0);
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalizedValue = normalizeNumberInput(value);
  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function normalizeNumberInput(value: string) {
  const trimmed = value.trim().replace(/\s/g, '');
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (hasComma && hasDot) {
    return trimmed.replace(/\./g, '').replace(',', '.');
  }

  if (hasComma) {
    return trimmed.replace(',', '.');
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    return trimmed.replace(/\./g, '');
  }

  return trimmed;
}

function getDraftAssetTotalCost(item: DraftAsset) {
  const directTotalCost = parseOptionalNumber(item.totalCostInput);

  if (directTotalCost !== null) {
    return directTotalCost;
  }

  const quantity = parseOptionalNumber(item.quantityInput);
  const averageCost = parseOptionalNumber(item.averageCostInput);

  if (quantity === null || averageCost === null) {
    return null;
  }

  return quantity * averageCost;
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
  hint?: string;
  tone?: 'income' | 'expense' | 'investment' | 'balance' | 'neutral';
};

function MetricCard({ hint, label, tone = 'neutral', value }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
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

function formatCompactMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    currency,
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
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

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'percent'
  }).format(value / 100);
}

function createContainerForm(
  container: FinancialContainer | undefined,
  currency: string
): ContainerFormState {
  return {
    containerType: container?.containerType ?? 'bank',
    currency: container?.currency ?? currency,
    id: container?.id,
    institution: container?.institution ?? '',
    name: container?.name ?? ''
  };
}

function createAssetForm(
  asset: PatrimonyAsset | undefined,
  containers: FinancialContainer[],
  initialContainerId?: string
): AssetFormState {
  return {
    assetType: asset?.assetType ?? 'fund',
    containerId: asset?.containerId ?? initialContainerId ?? containers[0]?.id ?? '',
    currency: asset?.currency ?? containers[0]?.currency ?? 'EUR',
    currentValue:
      asset && hasAssetCurrentValue(asset) ? String(Math.abs(asset.manualValue)) : '',
    id: asset?.id,
    name: asset?.name ?? '',
    notes: asset?.notes ?? '',
    purchaseDate: asset?.purchaseDate ?? '',
    purchasePrice:
      asset?.purchasePrice === null ? '' : String(asset?.purchasePrice ?? ''),
    averageCost: asset?.averageCost === null ? '' : String(asset?.averageCost ?? ''),
    quantity: asset?.quantity === null ? '' : String(asset?.quantity ?? ''),
    totalCost: asset?.totalCost === null ? '' : String(asset?.totalCost ?? '')
  };
}

function getAssetPerformance(asset: PatrimonyAsset) {
  const totalCost = asset.totalCost;
  const hasCurrentValue = hasAssetCurrentValue(asset);

  if (!totalCost || totalCost <= 0) {
    return {
      profit: null,
      returnPercentage: null,
      totalCost: null
    };
  }

  if (!hasCurrentValue || asset.currentValueIsEstimated) {
    return {
      profit: null,
      returnPercentage: null,
      totalCost
    };
  }

  const profit = asset.manualValue - totalCost;

  return {
    profit,
    returnPercentage: (profit / totalCost) * 100,
    totalCost
  };
}

function hasAssetCurrentValue(asset: PatrimonyAsset) {
  return (
    asset.hasCurrentValuation ||
    asset.currentValueIsEstimated ||
    Math.abs(asset.manualValue) > 0
  );
}

function getAssetCurrentValueLabel(asset: PatrimonyAsset) {
  if (!hasAssetCurrentValue(asset)) {
    return 'Valor pendiente';
  }

  return formatMoney(asset.manualValue, asset.currency);
}

function getAssetCostSummary(asset: PatrimonyAsset) {
  const performance = getAssetPerformance(asset);

  if (performance.totalCost !== null && asset.currentValueIsEstimated) {
    return `Valor estimado por coste - ${formatMoney(
      performance.totalCost,
      asset.currency
    )}`;
  }

  if (performance.totalCost !== null && !hasAssetCurrentValue(asset)) {
    return `Coste invertido: ${formatMoney(performance.totalCost, asset.currency)}`;
  }

  if (performance.totalCost === null || performance.profit === null) {
    return asset.quantity
      ? `${asset.quantity} unidades - Coste no informado`
      : 'Coste no informado';
  }

  return `Coste ${formatMoney(performance.totalCost, asset.currency)} - Beneficio ${formatMoney(
    performance.profit,
    asset.currency
  )} (${formatPercentage(performance.returnPercentage ?? 0)})`;
}

function getFinancialAccountLabel(account: FinancialAccount) {
  if (
    account.institutionName &&
    account.institutionName !== 'Manual' &&
    !account.name.toLowerCase().includes(account.institutionName.toLowerCase())
  ) {
    return `${account.institutionName} / ${account.name}`;
  }

  return account.name;
}

function getContainerDisplayName(container: FinancialContainer) {
  if (
    container.institution &&
    !container.name.toLowerCase().includes(container.institution.toLowerCase())
  ) {
    return `${container.institution} / ${container.name}`;
  }

  return container.name;
}

type TransactionDisplay = Pick<
  DashboardTransaction,
  | 'accountName'
  | 'description'
  | 'direction'
  | 'linkedAccountName'
  | 'linkedTransactionId'
  | 'movementType'
  | 'occurredAt'
>;

function getTransactionTitle(transaction: TransactionDisplay) {
  if (transaction.movementType !== 'transfer') {
    return transaction.description;
  }

  if (!transaction.linkedTransactionId || !transaction.linkedAccountName) {
    return 'Transferencia interna pendiente de emparejar';
  }

  return 'Transferencia interna';
}

function getTransactionSubtitle(transaction: TransactionDisplay) {
  const date = formatDate(transaction.occurredAt);

  if (transaction.movementType !== 'transfer') {
    return date;
  }

  if (!transaction.linkedTransactionId || !transaction.linkedAccountName) {
    return `${date} · ${transaction.accountName}`;
  }

  const origin =
    transaction.direction === 'outflow'
      ? transaction.accountName
      : transaction.linkedAccountName;
  const destination =
    transaction.direction === 'outflow'
      ? transaction.linkedAccountName
      : transaction.accountName;

  return `${origin} -> ${destination}`;
}

function getSnapshotTypeLabel(type: SnapshotItemType) {
  const labels: Record<SnapshotItemType, string> = {
    bank_account: 'Cuenta bancaria',
    broker: 'Broker',
    cash: 'Efectivo',
    crypto: 'Cripto',
    etf: 'ETF',
    fund: 'Fondo',
    liability: 'Deuda',
    other_asset: 'Otro activo',
    real_estate: 'Inmueble',
    stock: 'Accion',
    vehicle: 'Vehiculo'
  };

  return labels[type] ?? 'Elemento';
}

function getSnapshotGroupLabel(label: string) {
  const snapshotType = label as SnapshotItemType;
  const knownTypes: SnapshotItemType[] = [
    'bank_account',
    'broker',
    'cash',
    'fund',
    'etf',
    'stock',
    'crypto',
    'real_estate',
    'vehicle',
    'other_asset',
    'liability'
  ];

  return knownTypes.includes(snapshotType) ? getSnapshotTypeLabel(snapshotType) : label;
}

function sumContainerValues(containers: FinancialContainer[]) {
  return containers.reduce((total, container) => total + container.totalValue, 0);
}

function getAllContainerAssets(containers: FinancialContainer[]) {
  return containers.flatMap((container) => container.assets);
}

function groupAssetsByType(assets: PatrimonyAsset[]) {
  const groups = new Map<AssetType, PatrimonyAsset[]>();

  assets.forEach((asset) => {
    groups.set(asset.assetType, [...(groups.get(asset.assetType) ?? []), asset]);
  });

  return [...groups.entries()]
    .map(([type, groupAssets]) => ({
      assets: groupAssets,
      total: groupAssets.reduce((total, asset) => total + asset.manualValue, 0),
      type
    }))
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total));
}

function getContainerTypeLabel(type: ContainerType) {
  const labels: Record<ContainerType, string> = {
    bank: 'Banco',
    broker: 'Broker',
    cash: 'Efectivo',
    exchange: 'Exchange',
    other: 'Otro',
    wallet: 'Wallet'
  };

  return labels[type];
}

function getContainerLabel(container: FinancialContainer) {
  if (
    container.institution &&
    container.institution.trim().toLowerCase() !== container.name.trim().toLowerCase()
  ) {
    return `${container.institution} / ${container.name}`;
  }

  return container.name;
}

function getDraftContainerLabel(container: DraftContainer) {
  const institution = container.institution?.trim();
  const name = container.name.trim();

  if (institution && name && institution.toLowerCase() !== name.toLowerCase()) {
    return `${institution} / ${name}`;
  }

  return name || institution || 'Cuenta sin nombre';
}

function getAssetTypeLabel(type: AssetType) {
  const labels: Record<AssetType, string> = {
    cash: 'Efectivo',
    crypto: 'Cripto',
    etf: 'ETF',
    fund: 'Fondo',
    gold: 'Oro',
    liability: 'Deuda',
    other: 'Otro activo',
    real_estate: 'Inmueble',
    stock: 'Accion',
    vehicle: 'Vehiculo'
  };

  return labels[type];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo cargar la informacion financiera.';
}
