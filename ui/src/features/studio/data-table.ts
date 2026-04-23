import type {
  DataTableModel,
  ModuleDataColumnType,
} from "@/features/studio/types";

export function createEmptyDataTable(raw = ""): DataTableModel {
  return {
    raw,
    hasHeader: true,
    columns: [
      { id: "column-1", label: "Label", type: "text" },
      { id: "column-2", label: "Value", type: "number" },
    ],
    rows: [],
  };
}

export function parseDelimitedRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function inferDataColumnType(values: string[]): ModuleDataColumnType {
  const samples = values.map((value) => value.trim()).filter(Boolean);
  if (samples.length === 0) {
    return "text";
  }

  const isPercent = samples.every((value) => /^-?\d+(\.\d+)?%$/.test(value));
  if (isPercent) {
    return "percent";
  }

  const isCurrency = samples.every((value) =>
    /^[$€£¥]-?\d{1,3}(,\d{3})*(\.\d+)?$|^[$€£¥]-?\d+(\.\d+)?$/.test(value),
  );
  if (isCurrency) {
    return "currency";
  }

  const isNumber = samples.every((value) =>
    /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(value),
  );
  if (isNumber) {
    return "number";
  }

  const isDateLike = samples.every((value) => !Number.isNaN(Date.parse(value)));
  if (isDateLike) {
    return "date";
  }

  return "text";
}

export function parseDataBlockInput(raw: string): DataTableModel {
  const trimmed = raw.trim();
  if (!trimmed) {
    return createEmptyDataTable("");
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return createEmptyDataTable(raw);
  }

  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const rows = lines.map((line) => parseDelimitedRow(line, delimiter));
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  const hasHeader = normalizedRows.length > 1;
  const header = hasHeader
    ? normalizedRows[0]
    : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  return {
    raw,
    hasHeader,
    columns: header.map((label, index) => ({
      id: `column-${index + 1}`,
      label: label || `Column ${index + 1}`,
      type: inferDataColumnType(dataRows.map((row) => row[index] ?? "")),
    })),
    rows: dataRows,
  };
}

export function stringifyDataTable(dataTable: DataTableModel) {
  const rows = dataTable.hasHeader
    ? [dataTable.columns.map((column) => column.label), ...dataTable.rows]
    : dataTable.rows;
  return rows.map((row) => row.join("\t")).join("\n");
}
