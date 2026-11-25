import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export interface ExportReportPayload {
  title: string;
  subtitle: string;
  organizationName?: string;
  generatedFor: string;
  metrics: Array<{ label: string; value: string }>;
  rows: Array<Record<string, string | number>>;
  notes?: string;
}

export function exportReportToCSV(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String(r[h] ?? '').replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(filename: string, payload: ExportReportPayload) {
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet([
    { Field: 'Report', Value: payload.title },
    { Field: 'Generated For', Value: payload.generatedFor },
    { Field: 'Organization', Value: payload.organizationName || 'LexiScore Individual' },
    { Field: 'Generated At', Value: new Date().toISOString() },
    ...payload.metrics.map((m) => ({ Field: m.label, Value: m.value })),
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  if (payload.rows.length > 0) {
    const detailsSheet = XLSX.utils.json_to_sheet(payload.rows);
    XLSX.utils.book_append_sheet(wb, detailsSheet, 'Records');
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportReportToPDF(filename: string, payload: ExportReportPayload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(67, 56, 202);
  doc.text(payload.organizationName ? `${payload.organizationName} · LexiScore` : 'LexiScore Performance Report', 44, y);

  y += 24;
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.title, 44, y);

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${payload.subtitle}  |  Candidate: ${payload.generatedFor}  |  ${new Date().toLocaleDateString()}`, 44, y);

  y += 20;
  doc.setDrawColor(226, 232, 240);
  doc.line(44, y, 550, y);
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Key Performance Summary', 44, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const m of payload.metrics) {
    doc.text(`${m.label}: ${m.value}`, 52, y);
    y += 15;
  }

  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Detailed Assessment Breakdown', 44, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of payload.rows.slice(0, 28)) {
    const line = Object.entries(row)
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ·  ');
    const wrapped = doc.splitTextToSize(line, 500);
    if (y + wrapped.length * 13 > 780) {
      doc.addPage();
      y = 48;
    }
    doc.text(wrapped, 44, y);
    y += wrapped.length * 13 + 5;
  }

  if (payload.notes) {
    y += 14;
    if (y > 760) {
      doc.addPage();
      y = 48;
    }
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const wrappedNote = doc.splitTextToSize(payload.notes, 500);
    doc.text(wrappedNote, 44, y);
  }

  doc.save(`${filename}.pdf`);
}
