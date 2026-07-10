export type MonthRange = {
  endDate: string;
  endExclusiveDate: string;
  endExclusiveIso: string;
  monthIndex: number;
  startDate: string;
  startIso: string;
  year: number;
};

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})/;

export function getMonthRange(year: number, monthIndex: number): MonthRange {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`Año financiero no valido: ${year}`);
  }

  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Indice de mes no valido: ${monthIndex}`);
  }

  const month = monthIndex + 1;
  const nextMonth = monthIndex === 11 ? 1 : month + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const startDate = formatDateParts(year, month, 1);
  const endExclusiveDate = formatDateParts(nextYear, nextMonth, 1);
  const endDate = formatDateParts(year, month, getDaysInMonth(year, month));

  return {
    endDate,
    endExclusiveDate,
    endExclusiveIso: toStartOfDayIso(endExclusiveDate),
    monthIndex,
    startDate,
    startIso: toStartOfDayIso(startDate),
    year
  };
}

export function getYearRange(year: number) {
  const startDate = formatDateParts(year, 1, 1);
  const endExclusiveDate = formatDateParts(year + 1, 1, 1);

  return {
    endExclusiveDate,
    endExclusiveIso: toStartOfDayIso(endExclusiveDate),
    startDate,
    startIso: toStartOfDayIso(startDate),
    year
  };
}

export function getDateInputRange(dateFrom: string, dateTo: string) {
  return {
    endExclusiveIso: dateTo ? toStartOfDayIso(getNextDateInput(dateTo)) : null,
    startIso: dateFrom ? toStartOfDayIso(dateFrom) : null
  };
}

export function getFinancialMonthIndex(value: string) {
  const parsed = parseFinancialDate(value);

  return parsed.monthIndex;
}

export function getFinancialYear(value: string) {
  const parsed = parseFinancialDate(value);

  return parsed.year;
}

export function isFinancialDateInMonth(value: string, year: number, monthIndex: number) {
  const parsed = parseFinancialDate(value);

  return parsed.year === year && parsed.monthIndex === monthIndex;
}

function parseFinancialDate(value: string) {
  const match = isoDatePattern.exec(value);

  if (!match) {
    const fallback = new Date(value);

    if (Number.isNaN(fallback.getTime())) {
      throw new Error(`Fecha financiera no valida: ${value}`);
    }

    return {
      day: fallback.getUTCDate(),
      monthIndex: fallback.getUTCMonth(),
      year: fallback.getUTCFullYear()
    };
  }

  const [, year, month, day] = match;

  return {
    day: Number(day),
    monthIndex: Number(month) - 1,
    year: Number(year)
  };
}

function getNextDateInput(value: string) {
  const match = isoDatePattern.exec(value);

  if (!match) {
    throw new Error(`Fecha de filtro no valida: ${value}`);
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));

  return formatDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function toStartOfDayIso(date: string) {
  return `${date}T00:00:00.000Z`;
}

function formatDateParts(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
