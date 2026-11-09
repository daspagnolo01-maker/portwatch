import ExcelJS from "exceljs";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

/** Genera un file .xlsx formattato (intestazione scura, filtri, colonne congelate). */
export async function buildXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PortWatch Termini Imerese";
  workbook.created = new Date();

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = spec.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 18,
    }));

    for (const row of spec.rows) {
      const values: Record<string, unknown> = {};
      for (const column of spec.columns) {
        const value = row[column.key];
        values[column.key] =
          value === null || value === undefined || value === "" ? "—" : value;
      }
      sheet.addRow(values);
    }

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFE2E8F0" }, size: 11 };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12202F" } };
    header.height = 22;
    header.alignment = { vertical: "middle" };
    header.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FF1E3A4F" } } };
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: spec.columns.length },
    };

    sheet.eachRow((row, index) => {
      if (index === 1) return;
      row.alignment = { vertical: "middle" };
      if (index % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export function excelFileName(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefix}_${stamp}.xlsx`;
}
