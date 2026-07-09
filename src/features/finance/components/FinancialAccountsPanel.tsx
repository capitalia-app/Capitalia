import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ActionButton } from '@/features/onboarding/components/ActionButton';
import {
  createFinancialAccount,
  getCurrentWorkspace,
  listFinancialAccounts,
  listInstitutions,
  type FinancialAccount,
  type FinancialAccountType,
  type InstitutionOption,
  type WorkspaceSummary
} from '@/features/finance/lib/accounts';

type FormState = {
  name: string;
  type: FinancialAccountType;
  institutionId: string;
  currency: string;
  initialBalance: string;
};

const accountTypes = [
  { value: 'checking', label: 'Banco' },
  { value: 'brokerage', label: 'Broker' },
  { value: 'crypto_wallet', label: 'Wallet cripto' },
  { value: 'cash', label: 'Efectivo' }
] satisfies Array<{ value: FinancialAccountType; label: string }>;

const initialFormState = {
  name: '',
  type: 'checking',
  institutionId: '',
  currency: 'EUR',
  initialBalance: ''
} satisfies FormState;

export function FinancialAccountsPanel() {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadAccounts();
  }, []);

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (total, account) => total + (account.balance ? account.balance : 0),
        0
      ),
    [accounts]
  );

  async function loadAccounts() {
    setIsLoading(true);
    setError(null);

    try {
      const [currentWorkspace, institutionOptions] = await Promise.all([
        getCurrentWorkspace(),
        listInstitutions()
      ]);
      const accountRows = await listFinancialAccounts(currentWorkspace.id);

      setWorkspace(currentWorkspace);
      setInstitutions(institutionOptions);
      setAccounts(accountRows.filter(isCashOrPlatformAccount));
      setFormState((current) => ({
        ...current,
        currency: currentWorkspace.baseCurrency || 'EUR',
        institutionId: institutionOptions[0]?.id ?? ''
      }));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!workspace) {
      setError('No se encontro un workspace activo.');
      return;
    }

    const name = formState.name.trim();
    const currency = formState.currency.trim().toUpperCase();
    const initialBalance = Number(formState.initialBalance || '0');

    if (!name) {
      setError('Anade un nombre para la cuenta.');
      return;
    }

    if (!Number.isFinite(initialBalance)) {
      setError('El saldo inicial no es valido.');
      return;
    }

    setIsSaving(true);

    try {
      await createFinancialAccount({
        workspaceId: workspace.id,
        name,
        type: formState.type,
        institutionId: formState.institutionId || null,
        currency,
        initialBalance
      });
      setSuccess('Cuenta creada correctamente.');
      setFormState({
        ...initialFormState,
        currency,
        institutionId: institutions[0]?.id ?? ''
      });
      setIsFormOpen(false);
      await loadAccounts();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="accounts-panel" aria-label="Cuentas financieras">
      <div className="section-heading accounts-heading">
        <div>
          <p className="eyebrow">Cuentas</p>
          <h2>Tu estructura financiera</h2>
          <span>{workspace?.name ?? 'Workspace personal'}</span>
        </div>
        <strong>{formatMoney(totalBalance, workspace?.baseCurrency ?? 'EUR')}</strong>
      </div>

      {error ? <p className="auth-message auth-message--error">{error}</p> : null}
      {success ? <p className="auth-message auth-message--success">{success}</p> : null}

      {isLoading ? <p className="panel-status">Cargando cuentas...</p> : null}

      {!isLoading && accounts.length === 0 ? (
        <div className="empty-state-card">
          <span>Aun no tienes cuentas conectadas</span>
          <p>Empieza con una cuenta manual y Capitalia ira creciendo contigo.</p>
          <ActionButton onClick={() => setIsFormOpen(true)} type="button">
            Crear primera cuenta
          </ActionButton>
        </div>
      ) : null}

      {!isLoading && accounts.length > 0 ? (
        <div className="account-list">
          {accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <div>
                <strong>{account.name}</strong>
                <span>
                  {getAccountTypeLabel(account.type)} · {account.institutionName}
                </span>
              </div>
              <div>
                <strong>{formatMoney(account.balance ?? 0, account.currency)}</strong>
                <small>{account.currency}</small>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && accounts.length > 0 ? (
        <ActionButton onClick={() => setIsFormOpen(true)} type="button">
          Crear cuenta
        </ActionButton>
      ) : null}

      {isFormOpen ? (
        <form
          className="account-form"
          onSubmit={(event) => {
            void handleCreateAccount(event);
          }}
        >
          <label>
            <span>Nombre</span>
            <input
              name="name"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              placeholder="Cuenta principal"
              required
              type="text"
              value={formState.name}
            />
          </label>

          <label>
            <span>Tipo</span>
            <select
              name="type"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  type: event.target.value as FinancialAccountType
                }))
              }
              value={formState.type}
            >
              {accountTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Institucion</span>
            <select
              name="institution"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  institutionId: event.target.value
                }))
              }
              value={formState.institutionId}
            >
              {institutions.length === 0 ? (
                <option value="">Manual</option>
              ) : (
                institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="account-form__grid">
            <label>
              <span>Moneda</span>
              <input
                maxLength={3}
                name="currency"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase()
                  }))
                }
                required
                type="text"
                value={formState.currency}
              />
            </label>
            <label>
              <span>Saldo inicial</span>
              <input
                inputMode="decimal"
                name="initialBalance"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    initialBalance: event.target.value
                  }))
                }
                placeholder="0"
                step="0.01"
                type="number"
                value={formState.initialBalance}
              />
            </label>
          </div>

          <div className="account-form__actions">
            <button
              className="text-link"
              disabled={isSaving}
              onClick={() => setIsFormOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <ActionButton disabled={isSaving} type="submit">
              {isSaving ? 'Guardando...' : 'Guardar cuenta'}
            </ActionButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function isCashOrPlatformAccount(account: FinancialAccount) {
  return ['checking', 'brokerage', 'crypto_wallet', 'cash'].includes(account.type);
}

function getAccountTypeLabel(type: FinancialAccountType) {
  return accountTypes.find((option) => option.value === type)?.label ?? 'Otro';
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency'
  }).format(value);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo completar la operacion.';
}
