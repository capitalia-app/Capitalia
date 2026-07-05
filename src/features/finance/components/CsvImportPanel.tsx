import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { ActionButton } from '@/features/onboarding/components/ActionButton';
import {
  getCsvImportContext,
  parseImportFile,
  saveCsvImport,
  type CsvImportContext,
  type IgnoredImportRow,
  type ParsedCsvTransaction
} from '@/features/finance/lib/csvImport';

type CsvImportPanelProps = {
  onBack: () => void;
};

export function CsvImportPanel({ onBack }: CsvImportPanelProps) {
  const [context, setContext] = useState<CsvImportContext | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [detectedFormat, setDetectedFormat] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedCsvTransaction[]>([]);
  const [ignoredRows, setIgnoredRows] = useState<IgnoredImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadContext();
  }, []);

  const selectedAccount = useMemo(
    () => context?.accounts.find((account) => account.id === selectedAccountId) ?? null,
    [context?.accounts, selectedAccountId]
  );

  async function loadContext() {
    setIsLoading(true);
    setError(null);

    try {
      const nextContext = await getCsvImportContext();

      setContext(nextContext);
      setSelectedAccountId(nextContext.accounts[0]?.id ?? '');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setError(null);
    setSuccess(null);
    setDetectedFormat('');
    setPreviewRows([]);
    setIgnoredRows([]);

    if (!file) {
      setSelectedFileName('');
      return;
    }

    if (!selectedAccount) {
      setError('Selecciona una cuenta antes de importar.');
      event.target.value = '';
      return;
    }

    setIsParsing(true);
    setSelectedFileName(file.name);

    try {
      const parsedImport = await parseImportFile(file, selectedAccount.currency);

      setDetectedFormat(parsedImport.sourceFormat);
      setPreviewRows(parsedImport.transactions);
      setIgnoredRows(parsedImport.ignoredRows);
    } catch (parseError) {
      setSelectedFileName('');
      setDetectedFormat('');
      setIgnoredRows([]);
      setError(getErrorMessage(parseError));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (!context || !selectedAccount) {
      setError('Selecciona una cuenta financiera.');
      return;
    }

    if (previewRows.length === 0) {
      setError('Carga un CSV reconocido antes de guardar.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await saveCsvImport({
        workspaceId: context.workspace.id,
        accountId: selectedAccount.id,
        fileName: selectedFileName,
        ignoredRows,
        transactions: previewRows
      });

      setSuccess(
        `Importacion completada: ${result.importedCount} movimientos importados, ${result.duplicateCount} duplicados omitidos, ${result.pendingReviewCount} pendientes de revisar y ${result.ignoredCount} movimientos ignorados.`
      );
      setPreviewRows([]);
      setSelectedFileName('');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="csv-import-panel" aria-label="Importar CSV">
      <button className="text-link csv-import-back" onClick={onBack} type="button">
        Volver al dashboard
      </button>

      <div className="section-heading">
        <p className="eyebrow">Importar</p>
        <h2>Excel o CSV bancario</h2>
        <span>
          {detectedFormat
            ? `Formato detectado: ${detectedFormat}`
            : 'Deteccion automatica'}
        </span>
      </div>

      {error ? <p className="auth-message auth-message--error">{error}</p> : null}
      {success ? <p className="auth-message auth-message--success">{success}</p> : null}

      {isLoading ? <p className="panel-status">Preparando importacion...</p> : null}

      {!isLoading && context?.accounts.length === 0 ? (
        <div className="empty-state-card">
          <span>Primero crea una cuenta para importar movimientos.</span>
          <p>Crea una cuenta antes de importar movimientos por CSV.</p>
        </div>
      ) : null}

      {!isLoading && context && context.accounts.length > 0 ? (
        <div className="csv-import-card">
          <label>
            <span>Cuenta destino</span>
            <select
              onChange={(event) => {
                setSelectedAccountId(event.target.value);
                setPreviewRows([]);
                setIgnoredRows([]);
                setSelectedFileName('');
                setDetectedFormat('');
                setSuccess(null);
                setError(null);
              }}
              value={selectedAccountId}
            >
              {context.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </select>
          </label>

          <label className="file-drop">
            <span>{selectedFileName || 'Seleccionar Excel o CSV'}</span>
            <small>Excel o CSV bancario con fecha, descripcion e importe</small>
            <input
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isParsing || isSaving}
              onChange={(event) => {
                void handleFileChange(event);
              }}
              type="file"
            />
          </label>
        </div>
      ) : null}

      {isParsing ? <p className="panel-status">Detectando formato...</p> : null}

      {previewRows.length > 0 ? (
        <>
          <div className="csv-preview-summary">
            <span>{previewRows.length} movimientos detectados</span>
            <strong>
              {formatMoney(
                getPreviewTotal(previewRows),
                selectedAccount?.currency ?? 'EUR'
              )}
            </strong>
          </div>

          <div className="csv-preview-list" aria-label="Vista previa CSV">
            {previewRows.slice(0, 8).map((row) => (
              <article className="csv-preview-row" key={row.id}>
                <div>
                  <strong>{row.description}</strong>
                  <span>
                    {formatDate(row.date)} · {getTypeLabel(row.transactionType)}
                  </span>
                </div>
                <strong className={row.direction === 'inflow' ? 'is-positive' : ''}>
                  {formatMoney(row.amount, row.currency)}
                </strong>
              </article>
            ))}
          </div>

          <ActionButton
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar movimientos'}
          </ActionButton>
        </>
      ) : null}

      {ignoredRows.length > 0 ? (
        <div className="csv-ignored-list" aria-label="Movimientos ignorados">
          <div className="csv-preview-summary">
            <span>{ignoredRows.length} movimientos ignorados</span>
            <strong>Revision</strong>
          </div>
          {ignoredRows.slice(0, 8).map((row) => (
            <article
              className="csv-ignored-row"
              key={`${row.sheetName}-${row.rowNumber}-${row.reason}`}
            >
              <strong>
                {row.sheetName} - fila {row.rowNumber}
              </strong>
              <span>{row.reason}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getPreviewTotal(rows: ParsedCsvTransaction[]) {
  return rows.reduce((total, row) => total + row.amount, 0);
}

function getTypeLabel(type: ParsedCsvTransaction['transactionType']) {
  if (type === 'income') {
    return 'Ingreso';
  }

  if (type === 'transfer') {
    return 'Transferencia';
  }

  if (type === 'investment') {
    return 'Inversion';
  }

  return 'Gasto real';
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    currency,
    maximumFractionDigits: 2,
    style: 'currency'
  }).format(value);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'No se pudo completar la importacion.';
}
