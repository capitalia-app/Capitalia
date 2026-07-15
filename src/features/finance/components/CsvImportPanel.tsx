import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { ActionButton } from '@/features/onboarding/components/ActionButton';
import {
  analyzeImportPreview,
  getCsvImportContext,
  parseImportFile,
  saveCsvImport,
  type CsvImportContext,
  type IgnoredImportRow,
  type ImportPreviewAnalysis,
  type ParsedCsvTransaction
} from '@/features/finance/lib/csvImport';

type CsvImportPanelProps = {
  onBack: () => void;
};

export function CsvImportPanel({ onBack }: CsvImportPanelProps) {
  const [context, setContext] = useState<CsvImportContext | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [detectedFormat, setDetectedFormat] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedCsvTransaction[]>([]);
  const [previewAnalysis, setPreviewAnalysis] = useState<ImportPreviewAnalysis | null>(
    null
  );
  const [ignoredRows, setIgnoredRows] = useState<IgnoredImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadContext();
  }, []);

  const selectedContainer = useMemo(
    () =>
      context?.containers.find((container) => container.id === selectedContainerId) ??
      null,
    [context?.containers, selectedContainerId]
  );

  async function loadContext() {
    setIsLoading(true);
    setError(null);

    try {
      const nextContext = await getCsvImportContext();

      setContext(nextContext);
      setSelectedContainerId(nextContext.containers[0]?.id ?? '');
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
    setPreviewAnalysis(null);
    setIgnoredRows([]);

    if (!file) {
      setSelectedFileName('');
      return;
    }

    if (!selectedContainer) {
      setError('Selecciona una cuenta o plataforma antes de importar.');
      event.target.value = '';
      return;
    }

    setIsParsing(true);
    setSelectedFileName(file.name);

    try {
      const parsedImport = await parseImportFile(file, selectedContainer.currency);
      const analyzedImport = context
        ? await analyzeImportPreview({
            container: selectedContainer,
            transactions: parsedImport.transactions,
            workspaceId: context.workspace.id
          })
        : null;

      setDetectedFormat(parsedImport.sourceFormat);
      setPreviewRows(parsedImport.transactions);
      setPreviewAnalysis(analyzedImport);
      setIgnoredRows(parsedImport.ignoredRows);
    } catch (parseError) {
      setSelectedFileName('');
      setDetectedFormat('');
      setPreviewAnalysis(null);
      setIgnoredRows([]);
      setError(getErrorMessage(parseError));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (!context || !selectedContainer) {
      setError('Selecciona una cuenta o plataforma.');
      return;
    }

    const newPreviewRows = getNewPreviewRows(previewAnalysis, previewRows);

    if (newPreviewRows.length === 0) {
      setError('No hay movimientos nuevos para guardar en esta importacion.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await saveCsvImport({
        container: selectedContainer,
        fileName: selectedFileName,
        ignoredRows,
        transactions: newPreviewRows,
        workspaceId: context.workspace.id
      });

      setSuccess(
        `Importacion completada: ${result.importedCount} movimientos importados, ${result.duplicateCount} duplicados omitidos, ${result.suspiciousCount} dudosos sin insertar, ${result.pendingReviewCount} pendientes de revisar y ${result.ignoredCount} movimientos ignorados.`
      );
      setPreviewRows([]);
      setPreviewAnalysis(null);
      setSelectedFileName('');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function markAsInternalTransfer(transactionId: string) {
    const mapAsTransfer = (row: ParsedCsvTransaction): ParsedCsvTransaction =>
      row.id === transactionId
        ? {
            ...row,
            movementType: 'transfer',
            transactionType: 'transfer',
            type: 'transfer'
          }
        : row;

    setPreviewRows((currentRows) => currentRows.map(mapAsTransfer));
    setPreviewAnalysis((currentAnalysis) =>
      currentAnalysis
        ? {
            ...currentAnalysis,
            items: currentAnalysis.items.map((item) => ({
              ...item,
              transaction: mapAsTransfer(item.transaction)
            }))
          }
        : currentAnalysis
    );
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

      {!isLoading && context?.containers.length === 0 ? (
        <div className="empty-state-card">
          <span>Primero define tu punto de partida o crea una cuenta/plataforma.</span>
          <p>
            Capitalia necesita una cuenta o plataforma real para asociar estos
            movimientos.
          </p>
        </div>
      ) : null}

      {!isLoading && context && context.containers.length > 0 ? (
        <div className="csv-import-card">
          <label>
            <span>A que cuenta/plataforma pertenece este archivo?</span>
            <select
              onChange={(event) => {
                setSelectedContainerId(event.target.value);
                setPreviewRows([]);
                setPreviewAnalysis(null);
                setIgnoredRows([]);
                setSelectedFileName('');
                setDetectedFormat('');
                setSuccess(null);
                setError(null);
              }}
              value={selectedContainerId}
            >
              {context.containers.map((container) => (
                <option key={container.id} value={container.id}>
                  {container.label} - {container.currency}
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
                selectedContainer?.currency ?? 'EUR'
              )}
            </strong>
          </div>

          {previewAnalysis ? (
            <div className="csv-preview-breakdown">
              <span>{previewAnalysis.newCount} nuevos</span>
              <span>{previewAnalysis.duplicateCount} duplicados</span>
              <span>{previewAnalysis.suspiciousCount} dudosos</span>
            </div>
          ) : null}

          <div className="csv-preview-list" aria-label="Vista previa CSV">
            {getNewPreviewRows(previewAnalysis, previewRows)
              .slice(0, 8)
              .map((row) => (
                <article className="csv-preview-row" key={row.id}>
                  <div>
                    <strong>{row.description}</strong>
                    <span>
                      {formatDate(row.date)} · {getTypeLabel(row.transactionType)}
                    </span>
                    {row.transactionType === 'transfer' ? (
                      <small>Transferencia interna</small>
                    ) : (
                      <button
                        className="text-link csv-preview-action"
                        onClick={() => markAsInternalTransfer(row.id)}
                        type="button"
                      >
                        Transferencia interna
                      </button>
                    )}
                  </div>
                  <strong className={row.direction === 'inflow' ? 'is-positive' : ''}>
                    {formatMoney(row.amount, row.currency)}
                  </strong>
                </article>
              ))}
          </div>

          {previewAnalysis &&
          previewAnalysis.items.some((item) => item.status !== 'new') ? (
            <div className="csv-duplicates-list" aria-label="Duplicados detectados">
              <div className="csv-preview-summary">
                <span>Duplicados y dudosos detectados</span>
                <strong>
                  {previewAnalysis.duplicateCount + previewAnalysis.suspiciousCount}
                </strong>
              </div>
              {previewAnalysis.items
                .filter((item) => item.status !== 'new')
                .slice(0, 10)
                .map((item) => (
                  <article className="csv-ignored-row" key={item.transaction.id}>
                    <strong>
                      {item.status === 'duplicate' ? 'Duplicado' : 'Dudoso'} -{' '}
                      {item.transaction.description}
                    </strong>
                    <span>
                      {formatDate(item.transaction.date)} -{' '}
                      {formatMoney(item.transaction.amount, item.transaction.currency)}
                    </span>
                    <span>
                      {item.reason}
                      {item.matchedTransaction
                        ? ` · existente ${formatDate(item.matchedTransaction.date)}`
                        : ''}
                    </span>
                    {item.matchedTransaction ? (
                      <small>
                        Duplicado de: {formatDate(item.matchedTransaction.date)} ·{' '}
                        {formatMoney(
                          item.matchedTransaction.amount,
                          item.transaction.currency
                        )}{' '}
                        · {item.matchedTransaction.description} ·{' '}
                        {item.matchedTransaction.accountName} · ref{' '}
                        {item.matchedTransaction.id.slice(0, 8)}
                      </small>
                    ) : null}
                  </article>
                ))}
            </div>
          ) : null}

          <ActionButton
            disabled={
              isSaving || getNewPreviewRows(previewAnalysis, previewRows).length === 0
            }
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar movimientos nuevos'}
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

function getNewPreviewRows(
  analysis: ImportPreviewAnalysis | null,
  fallbackRows: ParsedCsvTransaction[]
) {
  return analysis
    ? analysis.items
        .filter((item) => item.status === 'new')
        .map((item) => item.transaction)
    : fallbackRows;
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
