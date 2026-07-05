import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { CsvImportPanel } from '@/features/finance/components/CsvImportPanel';
import { FinancialAccountsPanel } from '@/features/finance/components/FinancialAccountsPanel';
import {
  getCurrentWorkspace,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';
import {
  getMovementTypeLabel,
  listCategoryRules,
  listTransactionCategories,
  updateTransactionCategory,
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
  createPatrimonialSnapshot,
  resetWorkspaceFinancialData,
  type CreateSnapshotItemInput,
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
  | 'accounts'
  | 'import'
  | 'movements'
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
    label: 'Mi Patrimonio',
    detail: 'Dashboard real'
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
    label: 'Flujo de dinero',
    detail: 'Movimientos reales'
  },
  {
    section: 'categories',
    label: 'Categorias',
    detail: 'Reglas automaticas'
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  function handleSelectSection(section: AppSection) {
    setActiveSection(section);
    setIsMenuOpen(false);
    setToastMessage(null);

    if (
      section === 'dashboard' ||
      section === 'movements' ||
      section === 'categories' ||
      section === 'settings'
    ) {
      void loadDashboard();
    }
  }

  let sectionContent = (
    <HomePanel
      error={error}
      isLoading={isLoading}
      summary={summary}
      onCreateAccount={() => handleSelectSection('accounts')}
      onCreateSnapshot={() => handleSelectSection('snapshot')}
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
      <SettingsPanel
        summary={summary}
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

  return (
    <ExperienceFrame className="dashboard-screen">
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
  onCreateSnapshot: () => void;
  onImportMovements: () => void;
  onRetry: () => void;
};

function HomePanel({
  error,
  isLoading,
  onCreateAccount,
  onCreateSnapshot,
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
        <p>Construyes patrimonio, no controlas gastos.</p>
        <small>
          {hasTransactions
            ? `Balance mensual: ${formatMoney(summary.monthBalance, summary.currency)}`
            : 'Sin movimientos importados'}
        </small>
      </section>

      {!summary.snapshot ? (
        <section className="empty-state-card">
          <span>Define tu punto de partida</span>
          <p>
            Define tu punto de partida para que Capitalia pueda calcular tu patrimonio
            correctamente.
          </p>
          <button className="text-link" onClick={onCreateSnapshot} type="button">
            Crear snapshot inicial
          </button>
        </section>
      ) : (
        <section className="metric-grid" aria-label="Resumen desde punto de partida">
          <MetricCard
            label="Patrimonio inicial"
            value={formatMoney(summary.initialNetWorth ?? 0, summary.currency)}
            hint={formatDate(summary.snapshot.snapshotDate)}
          />
          <MetricCard
            label="Ingresos desde inicio"
            value={formatMoney(summary.incomeSinceStart, summary.currency)}
          />
          <MetricCard
            label="Gastos desde inicio"
            value={formatMoney(summary.expensesSinceStart, summary.currency)}
            hint="Gastos reales"
          />
          <MetricCard
            label="Invertido desde inicio"
            value={formatMoney(summary.investedSinceStart, summary.currency)}
          />
          <MetricCard
            label="Transferencias"
            value={formatMoney(summary.transfersSinceStart, summary.currency)}
          />
          <MetricCard
            label="Patrimonio estimado"
            value={formatMoney(summary.estimatedNetWorth, summary.currency)}
          />
        </section>
      )}

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
          hint="Gastos reales"
        />
        <MetricCard
          label="Invertido"
          value={formatMoney(summary.monthInvested, summary.currency)}
          hint="Construccion patrimonial"
        />
        <MetricCard
          label="Transferencias"
          value={formatMoney(summary.monthTransfers, summary.currency)}
          hint="Sin impacto en balance"
        />
        <MetricCard
          label="Balance"
          value={formatMoney(summary.monthBalance, summary.currency)}
          hint="Ingresos - gastos reales"
        />
      </section>

      {hasTransactions ? (
        <section className="empty-state-card">
          <span>Tasa de construccion patrimonial</span>
          <p>{getWealthBuildCopy(summary.wealthBuildRate)}</p>
        </section>
      ) : null}

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
                  <small>{getMovementTypeLabel(transaction.movementType)}</small>
                  <small>{transaction.categoryName ?? transaction.accountName}</small>
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
  onUpdated: () => void;
};

function MovementsPanel({
  error,
  isLoading,
  onImportMovements,
  onRetry,
  onUpdated,
  summary
}: MovementsPanelProps) {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [rememberRuleById, setRememberRuleById] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!summary?.workspace.id) {
      setCategories([]);
      return;
    }

    void loadCategories(summary.workspace.id);
  }, [summary?.workspace.id]);

  async function loadCategories(workspaceId: string) {
    try {
      setCategories(await listTransactionCategories(workspaceId));
    } catch (categoryError) {
      setLocalError(getErrorMessage(categoryError));
    }
  }

  async function handleCategoryChange(
    transaction: DashboardTransaction,
    categoryId: string
  ) {
    if (!summary || !categoryId) {
      return;
    }

    setUpdatingId(transaction.id);
    setLocalError(null);

    try {
      await updateTransactionCategory({
        categoryId,
        description: transaction.description,
        rememberRule: rememberRuleById[transaction.id] ?? false,
        transactionId: transaction.id,
        workspaceId: summary.workspace.id
      });
      onUpdated();
    } catch (updateError) {
      setLocalError(getErrorMessage(updateError));
    } finally {
      setUpdatingId(null);
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

  const transactions = summary?.recentTransactions ?? [];

  return (
    <section className="assets-panel" aria-label="Movimientos">
      <div className="section-heading">
        <p className="eyebrow">Flujo de dinero</p>
        <h2>Movimientos reales</h2>
        <span>{transactions.length > 0 ? 'Ultimos 10' : 'Sin movimientos'}</span>
      </div>

      {localError ? (
        <p className="auth-message auth-message--error">{localError}</p>
      ) : null}

      {transactions.length > 0 ? (
        <div className="asset-list">
          {transactions.map((transaction) => (
            <article className="asset-row transaction-row" key={transaction.id}>
              <div className="transaction-row__main">
                <strong>{transaction.description}</strong>
                <span>
                  {formatDate(transaction.occurredAt)} · {transaction.accountName}
                </span>
                <small>
                  {getMovementTypeLabel(transaction.movementType)} ·{' '}
                  {transaction.categoryName ?? 'Sin categoria'}
                </small>
              </div>
              <div className="transaction-row__amount">
                <strong>
                  {transaction.direction === 'inflow' ? '+' : '-'}
                  {formatMoney(transaction.amount, transaction.currency)}
                </strong>
                <small>{transaction.isReviewed ? 'Revisado' : 'Pendiente'}</small>
              </div>
              <div className="transaction-row__editor">
                <label>
                  <span>Categoria</span>
                  <select
                    disabled={updatingId === transaction.id}
                    onChange={(event) => {
                      void handleCategoryChange(transaction, event.target.value);
                    }}
                    value={transaction.categoryId ?? ''}
                  >
                    <option value="">Sin categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} · {getMovementTypeLabel(category.movementType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="remember-rule">
                  <input
                    checked={rememberRuleById[transaction.id] ?? false}
                    onChange={(event) =>
                      setRememberRuleById((current) => ({
                        ...current,
                        [transaction.id]: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Recordar esta clasificacion para el futuro</span>
                </label>
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

type CategoriesPanelProps = {
  summary: DashboardSummary | null;
};

function CategoriesPanel({ summary }: CategoriesPanelProps) {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
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
  items: SnapshotDraftItem[];
};

type SnapshotDraftItem = CreateSnapshotItemInput & {
  localId: string;
  valueInput: string;
};

const snapshotItemTypes = [
  { value: 'bank_account', label: 'Cuenta bancaria' },
  { value: 'broker', label: 'Broker' },
  { value: 'cash', label: 'Cash' },
  { value: 'fund', label: 'Fondo' },
  { value: 'etf', label: 'ETF' },
  { value: 'stock', label: 'Accion' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'vehicle', label: 'Vehiculo' },
  { value: 'other_asset', label: 'Otro activo' },
  { value: 'liability', label: 'Pasivo' }
] satisfies Array<{ value: SnapshotItemType; label: string }>;

function SnapshotPanel({ onBack, onSaved, summary }: SnapshotPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [formState, setFormState] = useState<SnapshotFormState>({
    items: [createDraftSnapshotItem(summary?.currency ?? 'EUR')],
    mode: 'today',
    notes: '',
    snapshotDate: today
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (!summary) {
      setError('No se encontro un workspace activo.');
      return;
    }

    const items = formState.items
      .map((item) => ({
        currency: item.currency.trim().toUpperCase(),
        name: item.name.trim(),
        notes: item.notes?.trim() || null,
        type: item.type,
        value: Number(item.valueInput)
      }))
      .filter((item) => item.name && Number.isFinite(item.value));

    if (items.length === 0) {
      setError('Anade al menos una linea de patrimonio inicial.');
      return;
    }

    setIsSaving(true);

    try {
      await createPatrimonialSnapshot({
        items,
        name: 'Snapshot inicial',
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
        <span>Capitalia necesita saber desde que fecha empiezas.</span>
      </div>

      <div className="empty-state-card">
        <span>Para que tu patrimonio cuadre</span>
        <p>
          Capitalia necesita saber desde que fecha empiezas y cuanto tenias en cada cuenta
          o activo.
        </p>
      </div>

      {error ? <p className="auth-message auth-message--error">{error}</p> : null}

      <form className="account-form">
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

        {formState.items.map((item) => (
          <div className="snapshot-item-row" key={item.localId}>
            <label>
              <span>Nombre</span>
              <input
                onChange={(event) =>
                  updateDraftItem(setFormState, item.localId, {
                    name: event.target.value
                  })
                }
                placeholder="BBVA, MyInvestor, BTC..."
                type="text"
                value={item.name}
              />
            </label>
            <label>
              <span>Tipo</span>
              <select
                onChange={(event) =>
                  updateDraftItem(setFormState, item.localId, {
                    type: event.target.value as SnapshotItemType
                  })
                }
                value={item.type}
              >
                {snapshotItemTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="account-form__grid">
              <label>
                <span>Valor inicial</span>
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    updateDraftItem(setFormState, item.localId, {
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
                    updateDraftItem(setFormState, item.localId, {
                      currency: event.target.value.toUpperCase()
                    })
                  }
                  type="text"
                  value={item.currency}
                />
              </label>
            </div>
            <label>
              <span>Notas opcionales</span>
              <input
                onChange={(event) =>
                  updateDraftItem(setFormState, item.localId, {
                    notes: event.target.value
                  })
                }
                type="text"
                value={item.notes ?? ''}
              />
            </label>
          </div>
        ))}

        <div className="account-form__actions">
          <button
            className="text-link"
            onClick={() =>
              setFormState((current) => ({
                ...current,
                items: [
                  ...current.items,
                  createDraftSnapshotItem(summary?.currency ?? 'EUR')
                ]
              }))
            }
            type="button"
          >
            Anadir linea
          </button>
          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar snapshot'}
          </ActionButton>
        </div>
      </form>
    </section>
  );
}

type SettingsPanelProps = {
  summary: DashboardSummary | null;
  onReset: (message: string) => void;
};

function SettingsPanel({ onReset, summary }: SettingsPanelProps) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(
    summary?.workspace ?? null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);
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
        <div className="modal-backdrop" role="presentation">
          <section className="danger-modal" role="dialog" aria-modal="true">
            <div className="section-heading">
              <p className="eyebrow">Confirmacion</p>
              <h2>Reset financiero</h2>
              <span>Esta accion no borra tu usuario ni workspace.</span>
            </div>
            <p>
              Se borraran movimientos, balances, cuentas financieras, reglas
              personalizadas, activos, precios y snapshots. Para confirmar, escribe
              exactamente RESET CAPITALIA.
            </p>
            <input
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="RESET CAPITALIA"
              type="text"
              value={confirmation}
            />
            <div className="account-form__actions">
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
            </div>
          </section>
        </div>
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

function createDraftSnapshotItem(currency: string) {
  return {
    currency,
    localId: crypto.randomUUID(),
    name: '',
    notes: '',
    type: 'bank_account',
    value: 0,
    valueInput: ''
  } satisfies SnapshotDraftItem;
}

function updateDraftItem(
  setFormState: Dispatch<SetStateAction<SnapshotFormState>>,
  localId: string,
  patch: Partial<SnapshotDraftItem>
) {
  setFormState((current) => ({
    ...current,
    items: current.items.map((item) =>
      item.localId === localId ? { ...item, ...patch } : item
    )
  }));
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
};

function MetricCard({ hint, label, value }: MetricCardProps) {
  return (
    <article className="metric-card">
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

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(date));
}

function getWealthBuildCopy(rate: number | null) {
  if (rate === null) {
    return 'Importa movimientos de ingresos y gastos reales para calcularla.';
  }

  if (rate < 0) {
    return 'Este mes tu flujo patrimonial ha sido negativo.';
  }

  return `Este mes has destinado ${rate.toFixed(0)}% de tus ingresos a construir patrimonio.`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo cargar la informacion financiera.';
}
