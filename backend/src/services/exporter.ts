import { ScenarioTemplate } from '../templates/defaultScenarioTemplate';
import ExcelJS from 'exceljs';

// CSV export removed per requirements; XLSX-only exporter implemented below.

export class XlsxExporter {
  private static writeWorksheet(
    sheet: ExcelJS.Worksheet,
    rows: any[],
    template: ScenarioTemplate,
    opts?: { title?: string }
  ) {
    // Optional title row in A1 to mirror reference sheets that include a title
    if (opts?.title) {
      const titleRow = sheet.addRow([opts.title]);
      const c = titleRow.getCell(1);
      c.font = { bold: true, name: 'Libre Franklin', size: 12 };
    }
    // Match the meta section used in the reference Google Sheet.
    // Note: The reference uses the misspelled label "Environtment"; we keep it to match exactly.
    const metaLabels = [
      'Version',
      'Environtment',
      'Author',
      'Tester',
      'Participants',
      '',
      'Created At',
      'Last Modified',
      '',
      '',
    ];
    metaLabels.forEach(label => {
      const r = sheet.addRow(label ? [label] : []);
      if (label) {
        const c = r.getCell(1);
        c.font = { bold: true, name: 'Libre Franklin', size: 10 };
      }
    });

    // Header row (blue) + spacer row, then merge vertically to increase height
    const headers = template.columns.map(c => c.label);
    const headerRow = sheet.addRow(headers);

    // Styles for header (match example: blue fill, white bold text, centered, thin black border)
    headerRow.eachCell(cell => {
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        name: 'Libre Franklin',
        size: 10,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1155CC' },
      } as any;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    });

    // Add a second row under the header and merge vertically per column
    const headerSpacerRow = sheet.addRow(headers.map(() => ''));
    for (let col = 1; col <= headers.length; col++) {
      try {
        sheet.mergeCells(headerRow.number, col, headerSpacerRow.number, col);
        const master = sheet.getCell(headerRow.number, col);
        // Ensure alignment and borders look right on the merged region
        master.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        } as any;
        master.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        } as any;
      } catch {}
    }

    // Freeze up to the merged header area
    sheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: headerSpacerRow.number },
    ];

    // Column widths to match example (Excel width units)
    const widths: number[] = [
      18.63, // A: User Story
      18.63, // B: Test ID
      16.75, // C: Test Type
      27.25, // D: Test Scenario
      36.75, // E: Pre-condition
      36.75, // F: Test Step
      46.75, // G: Result
      16.63, // H: Status
      36.0, // I: Additional Note
    ];
    template.columns.forEach((c, idx) => {
      const col = sheet.getColumn(idx + 1);
      col.width = widths[idx] ?? 24;
      col.alignment = { vertical: 'top', wrapText: true };
    });

    // Re-apply header alignment after column defaults so headers stay centered
    for (let col = 1; col <= headers.length; col++) {
      const master = sheet.getCell(headerRow.number, col);
      master.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      } as any;
    }

    // Write one row per scenario; convert any array-typed columns to newline-separated text
    const keys = template.columns.map(c => c.key);
    const isArrayCol = template.columns.map(c => c.type === 'array');
    const toArray = (v: any): string[] => {
      if (Array.isArray(v)) return v.filter(x => x != null).map(x => String(x));
      if (v == null) return [];
      return String(v)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    };
    for (const r of rows) {
      const rowVals = keys.map((k, idx) => {
        const v = (r || {})[k];
        if (isArrayCol[idx]) {
          const arr = toArray(v);
          if (k === 'test_step') {
            return arr.map((s, i) => `${i + 1}. ${s}`).join('\n');
          }
          return arr.join('\n');
        }
        return v == null ? '' : String(v);
      });

      const added = sheet.addRow(rowVals);
      added.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
        cell.font = { name: 'Libre Franklin', size: 10 };
        // Default alignment for data cells
        const key = keys[colNumber - 1];
        if (key === 'status') {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true,
          } as any;
        } else {
          cell.alignment = { vertical: 'top', wrapText: true } as any;
        }
      });
    }
  }

  static async toXlsxBuffer(
    rows: any[],
    template: ScenarioTemplate,
    opts?: { sheetName?: string; title?: string }
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(opts?.sheetName || 'Scenarios');
    this.writeWorksheet(sheet, rows, template, { title: opts?.title });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  static async toXlsxMultiSheetBuffer(
    sheets: Array<{ name: string; rows: any[]; title?: string }>,
    template: ScenarioTemplate
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    for (const s of sheets) {
      const ws = workbook.addWorksheet(s.name || 'Scenarios');
      this.writeWorksheet(ws, s.rows, template, { title: s.title });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
