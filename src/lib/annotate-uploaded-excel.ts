import * as XLSX from "xlsx";
import type { Department, HoursRange } from "../api/types";

type EditableRow = {
  featureIndex: number;
  batch: string;
  featureName: string;
  featureDescription: string;
  confidence: string;
  complexity: string;
  techRemarks: string;
  userRemark: string;
  ranges: Record<Department, HoursRange>;
};

function norm(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRowEmpty(row: unknown[]) {
  return row.every((c) => norm(c) === "");
}

function findHeaderRowIndex(aoa: unknown[][]) {
  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i];
    if (Array.isArray(row) && row.length > 0 && !isRowEmpty(row as unknown[]))
      return i;
  }
  return 0;
}

function pickColumnIndex(headerRow: unknown[], candidates: RegExp[]) {
  const h = headerRow.map((x) => norm(x));
  for (const re of candidates) {
    const idx = h.findIndex((cell) => re.test(cell));
    if (idx >= 0) return idx;
  }
  return -1;
}

function getAoa(wb: XLSX.WorkBook, sheetName: string) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("Sheet not found");
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];
}

function writeAoa(wb: XLSX.WorkBook, sheetName: string, aoa: unknown[][]) {
  wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(aoa);
}

function downloadArrayAsXlsx(array: ArrayBuffer, filename: string) {
  const blob = new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const DEPARTMENTS: Department[] = [
  "frontend",
  "backend",
  "mobile",
  "htmlCss",
  "aiMl",
];

function headerLabel(dept: Department, k: keyof HoursRange) {
  const deptLabel: Record<Department, string> = {
    frontend: "Frontend",
    backend: "Backend",
    mobile: "Mobile",
    htmlCss: "HTML/CSS",
    aiMl: "AI/ML",
  };
  const keyLabel: Record<keyof HoursRange, string> = {
    min: "Min",
    mostLikely: "MostLikely",
    max: "Max",
  };
  return `AI ${deptLabel[dept]} ${keyLabel[k]}`;
}

export async function exportUploadedExcelWithEstimates(params: {
  originalFile: File;
  rows: EditableRow[];
  outputFileName?: string;
}) {
  const { originalFile, rows, outputFileName } = params;

  if (!originalFile) throw new Error("Missing original Excel file");
  if (!rows || rows.length === 0) throw new Error("No estimates to export");

  const ab = await originalFile.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });

  // Mirror backend preference: 2nd sheet if present, else 1st.
  const sheetName = wb.SheetNames[1] ?? wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in uploaded workbook");

  const aoa = getAoa(wb, sheetName);
  if (aoa.length === 0) throw new Error("Uploaded sheet is empty");

  const headerRowIndex = findHeaderRowIndex(aoa);
  const headerRow = (aoa[headerRowIndex] ?? []) as unknown[];

  const featureCol = pickColumnIndex(headerRow, [
    /^feature$/,
    /^features$/,
    /^feature\s*name$/,
    /^title$/,
    /^name$/,
  ]);
  const featureIndexCol = pickColumnIndex(headerRow, [
    /^feature\s*index$/,
    /^index$/,
    /^sr\.?\s*no\.?$/,
    /^s\.?\s*no\.?$/,
  ]);

  if (featureCol < 0 && featureIndexCol < 0) {
    throw new Error(
      "Could not find a 'Feature' or 'Feature Index' column in the uploaded sheet"
    );
  }

  // Build lookups from the generated results.
  const byFeatureName = new Map<string, EditableRow>();
  const byFeatureIndex = new Map<number, EditableRow>();
  for (const r of rows) {
    byFeatureIndex.set(Number(r.featureIndex), r);
    const key = norm(r.featureName);
    if (key && !byFeatureName.has(key)) byFeatureName.set(key, r);
  }

  // Append new headers to the right.
  const baseLen = headerRow.length;
  const appendedHeaders: string[] = [];
  for (const d of DEPARTMENTS) {
    appendedHeaders.push(
      headerLabel(d, "min"),
      headerLabel(d, "mostLikely"),
      headerLabel(d, "max")
    );
  }
  appendedHeaders.push(
    "AI Confidence",
    "AI Complexity",
    "AI Tech Remarks",
    "AI User Remark"
  );

  aoa[headerRowIndex] = [...headerRow, ...appendedHeaders];

  // Fill each data row.
  for (let r = headerRowIndex + 1; r < aoa.length; r++) {
    const row = (aoa[r] ?? []) as unknown[];
    if (isRowEmpty(row)) continue;

    let hit: EditableRow | undefined;

    if (featureIndexCol >= 0) {
      const v = Number(row[featureIndexCol]);
      if (Number.isFinite(v)) hit = byFeatureIndex.get(v);
    }

    if (!hit && featureCol >= 0) {
      hit = byFeatureName.get(norm(row[featureCol]));
    }

    // Final fallback: match by row order to featureIndex-sorted rows.
    if (!hit) {
      const sorted = [...rows].sort(
        (a, b) => Number(a.featureIndex) - Number(b.featureIndex)
      );
      const dataRowOrdinal = r - (headerRowIndex + 1);
      hit = sorted[dataRowOrdinal];
    }

    while (row.length < baseLen + appendedHeaders.length) row.push("");

    if (hit) {
      let c = baseLen;
      for (const d of DEPARTMENTS) {
        const range = hit.ranges[d];
        row[c++] = range?.min ?? "";
        row[c++] = range?.mostLikely ?? "";
        row[c++] = range?.max ?? "";
      }
      row[c++] = hit.confidence ?? "";
      row[c++] = hit.complexity ?? "";
      row[c++] = hit.techRemarks ?? "";
      row[c++] = hit.userRemark ?? "";
    }

    aoa[r] = row;
  }

  writeAoa(wb, sheetName, aoa);

  const baseName = originalFile.name.replace(/\.(xlsx|xls)$/i, "");
  const outName = outputFileName ?? `${baseName}_with_estimates.xlsx`;

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadArrayAsXlsx(out, outName);
}
