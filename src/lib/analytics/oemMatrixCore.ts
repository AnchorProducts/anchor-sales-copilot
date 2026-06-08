// Pure (jsPDF-free) types and aggregation for the OEM matrix. Kept separate from
// oemMatrixPdf.ts so pages that only need the on-screen totals (computeTotals)
// don't pull jspdf (~300KB) into their initial bundle — the PDF renderers in
// oemMatrixPdf.ts are dynamically imported on demand.

export type MatrixCellPerson = {
  name: string;
  email: string | null;
  signedUp: boolean;
  uses: number;
  leads: number;
  reports: number;
};

export type MatrixCell = {
  downloaded: number;
  notDownloaded: number;
  uses: number;
  notReporting: number;
  leads: number;
  reports: number;
  people: MatrixCellPerson[];
};

export type MatrixGroup = "sales" | "tech" | "consultant";
export type MatrixRow = { manufacturer: string; groups: Record<MatrixGroup, MatrixCell> };

export type EventDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; type: string; at: string; label: string };
export type ProjectDetail = { person: string; group: string; groupLabel: string; manufacturers: string[]; kind: "Lead" | "Report"; at: string; company: string };

export type MatrixPdfPayload = {
  rows: MatrixRow[];
  totals: Record<MatrixGroup, MatrixCell>;
  events: EventDetail[];
  projects: ProjectDetail[];
};

export const ALL_GROUPS: MatrixGroup[] = ["sales", "tech", "consultant"];

export function emptyCell(): MatrixCell {
  return { downloaded: 0, notDownloaded: 0, uses: 0, notReporting: 0, leads: 0, reports: 0, people: [] };
}

export function computeTotals(rows: MatrixRow[]): Record<MatrixGroup, MatrixCell> {
  const totals: Record<MatrixGroup, MatrixCell> = { sales: emptyCell(), tech: emptyCell(), consultant: emptyCell() };
  for (const r of rows) {
    for (const g of ALL_GROUPS) {
      const t = totals[g];
      const c = r.groups[g];
      t.downloaded += c.downloaded;
      t.notDownloaded += c.notDownloaded;
      t.uses += c.uses;
      t.notReporting += c.notReporting;
      t.leads += c.leads;
      t.reports += c.reports;
    }
  }
  return totals;
}
