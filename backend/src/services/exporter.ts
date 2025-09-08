import { ScenarioTemplate } from '../templates/defaultScenarioTemplate';
import ExcelJS from 'exceljs';

// CSV export removed per requirements; XLSX-only exporter implemented below.

export class XlsxExporter {
  static async toXlsxBuffer(rows: any[], template: ScenarioTemplate, opts?: { sheetName?: string }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(opts?.sheetName || 'Scenarios');

    // Optional metadata section (labels only; values left blank)
    const metaLabels = [
      'Version',
      'Environment',
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
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Libre Franklin', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
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
        master.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true } as any;
        master.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        } as any;
      } catch {}
    }

    // Freeze up to the merged header area
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerSpacerRow.number }];

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
      36.0,  // I: Additional Note
    ];
    template.columns.forEach((c, idx) => {
      const col = sheet.getColumn(idx + 1);
      col.width = widths[idx] ?? 24;
      col.alignment = { vertical: 'top', wrapText: true };
    });

    // Re-apply header alignment after column defaults so headers stay centered
    for (let col = 1; col <= headers.length; col++) {
      const master = sheet.getCell(headerRow.number, col);
      master.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true } as any;
    }

    // Expand scenario rows into multiple lines following the example style
    const keys = template.columns.map(c => c.key);

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

    const get = (r: any, k: string) => r?.[k];

    let currentRowPointer = headerSpacerRow.number; // track last written row index
    for (const r of rows) {
      const base = keys.map(k => get(r, k));
      // Arrays we care to expand (by conventional Google template keys)
      const pre = toArray(get(r, 'pre_condition'));
      const steps = toArray(get(r, 'test_step'));
      const results = toArray(get(r, 'result'));
      const status = get(r, 'status') ?? 'NONE';

      const maxLines = Math.max(1, pre.length, steps.length, results.length);

      const startRowIndex = currentRowPointer + 1;
      for (let i = 0; i < maxLines; i++) {
        const rowVals = [...base];
        if (i > 0) {
          // Clear non-repeating columns for continuation rows
          // Keep status on each row for readability
          const clearKeys = ['user_story', 'test_id', 'test_type', 'test_scenario', 'additional_note'];
          clearKeys.forEach(k => {
            const colIdx = keys.indexOf(k);
            if (colIdx >= 0) rowVals[colIdx] = '';
          });
        }

        const preIdx = keys.indexOf('pre_condition');
        const stepIdx = keys.indexOf('test_step');
        const resultIdx = keys.indexOf('result');
        const statusIdx = keys.indexOf('status');
        // Put multiline content only on the first row; subsequent rows blank.
        if (preIdx >= 0) rowVals[preIdx] = i === 0 ? pre.join('\n') : '';
        if (stepIdx >= 0)
          rowVals[stepIdx] = i === 0 ? steps.map((s, ii) => `${ii + 1}. ${s}`).join('\n') : '';
        if (resultIdx >= 0) rowVals[resultIdx] = i === 0 ? results.join('\n') : '';
        if (statusIdx >= 0) rowVals[statusIdx] = i === 0 ? status : '';

        const added = sheet.addRow(rowVals);
        added.eachCell(cell => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
          };
          cell.font = { name: 'Libre Franklin', size: 10 };
        });
        // Center align Status column
        if (statusIdx >= 0) {
          const statusCell = added.getCell(statusIdx + 1);
          statusCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true } as any;
        }
        currentRowPointer = added.number;
      }

      // Merge shared cells across the block like the example sheet
      const endRowIndex = startRowIndex + maxLines - 1;
      if (maxLines > 1) {
        const mergeKeys = [
          'user_story',
          'test_id',
          'test_type',
          'test_scenario',
          'pre_condition',
          'test_step',
          'result',
          'status',
          'additional_note',
        ];
        mergeKeys.forEach(k => {
          const colIdx = keys.indexOf(k);
          if (colIdx >= 0) {
            const col = colIdx + 1; // 1-based index
            try {
              sheet.mergeCells(startRowIndex, col, endRowIndex, col);
              const masterCell = sheet.getCell(startRowIndex, col);
              // Alignment per merged column
              if (k === 'status') {
                masterCell.alignment = { vertical: 'middle', horizontal: 'center' } as any;
              } else {
                // Keep top alignment for large multi-line cells
                masterCell.alignment = { vertical: 'top', wrapText: true } as any;
              }
              // Re-apply borders on the merged region
              for (let rIdx = startRowIndex; rIdx <= endRowIndex; rIdx++) {
                const c = sheet.getCell(rIdx, col);
                c.border = {
                  top: { style: rIdx === startRowIndex ? 'thin' : 'thin', color: { argb: 'FF000000' } },
                  left: { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: { style: rIdx === endRowIndex ? 'thin' : 'thin', color: { argb: 'FF000000' } },
                  right: { style: 'thin', color: { argb: 'FF000000' } },
                };
              }
            } catch {}
          }
        });
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
