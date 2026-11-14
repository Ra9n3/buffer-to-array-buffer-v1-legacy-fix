/**
 * ALLOY — the `?debug=meters` table (Stage 1, Step 6).
 *
 * One fixed-position monospace table, top-right, opaque: one row per metered
 * point (every track, bus, Return, and master), columns id / peakL / peakR /
 * vuL / vuR / corr / over, numbers with one decimal, corr "-" when null, over
 * 1 or 0. It contains nothing else — no title, no caption, no legend, no
 * helper text of any kind.
 *
 * One requestAnimationFrame loop redraws it, writing a cell's text only when
 * the value changed; the loop exists only while the table is mounted, and the
 * table is mounted only when the URL asked for it (main.ts).
 */

import { newMeterReading, type MeterReading, type MeterSet } from "../engine/metering";
import { currentMeterSet, readCurrent, type MeterPointId, type MeterPointKind } from "./meter-bus";

/** One table row: its point address, its cells, and the last text in each. */
interface Row {
  readonly kind: MeterPointKind;
  readonly id: MeterPointId;
  readonly cells: readonly HTMLTableCellElement[];
  readonly last: string[];
}

const COLUMNS = ["id", "peakL", "peakR", "vuL", "vuR", "corr", "over"] as const;

function setText(cell: HTMLTableCellElement, last: string[], index: number, text: string): void {
  if (last[index] !== text) {
    last[index] = text;
    cell.textContent = text;
  }
}

/**
 * Mount the table into `doc` and start its redraw loop. Returns the stop
 * function (the app never calls it; a test harness may).
 */
export function mountMeterDebugTable(doc: Document): () => void {
  const reading: MeterReading = newMeterReading();
  const rows: Row[] = [];
  let lastSet: MeterSet | null = null;
  let frame = 0;

  const table = doc.createElement("table");
  table.setAttribute("data-meter-debug", "");
  // Fixed, top-right, small, monospace, opaque — and nothing else.
  table.style.position = "fixed";
  table.style.top = "8px";
  table.style.right = "8px";
  table.style.zIndex = "2147483647";
  table.style.fontFamily = "monospace";
  table.style.fontSize = "11px";
  table.style.lineHeight = "1.35";
  table.style.background = "#111111";
  table.style.color = "#eeeeee";
  table.style.borderCollapse = "collapse";

  const head = table.createTHead();
  const headRow = head.insertRow(-1);
  for (const column of COLUMNS) {
    const cell = doc.createElement("th");
    cell.textContent = column;
    cell.style.border = "1px solid #444444";
    cell.style.padding = "1px 6px";
    cell.style.fontWeight = "normal";
    cell.style.textAlign = "right";
    headRow.appendChild(cell);
  }
  headRow.cells[0].style.textAlign = "left";
  const body = table.createTBody();
  doc.body.appendChild(table);

  const makeRow = (kind: MeterPointKind, id: MeterPointId): void => {
    const tr = body.insertRow(-1);
    const cells: HTMLTableCellElement[] = [];
    const nameCell = doc.createElement("td");
    nameCell.textContent = id;
    nameCell.style.border = "1px solid #444444";
    nameCell.style.padding = "1px 6px";
    tr.appendChild(nameCell);
    for (let i = 1; i < COLUMNS.length; i++) {
      const cell = doc.createElement("td");
      cell.style.border = "1px solid #444444";
      cell.style.padding = "1px 6px";
      cell.style.textAlign = "right";
      tr.appendChild(cell);
      cells.push(cell);
    }
    rows.push({ kind, id, cells, last: cells.map(() => "\u0000") });
  };

  /** Rows follow the project's own point list; rebuilt per registered attempt. */
  const rebuild = (set: MeterSet | null): void => {
    rows.length = 0;
    body.replaceChildren();
    if (set === null) return;
    for (const id of set.tracks.keys()) makeRow("track", id);
    for (const id of set.buses.keys()) makeRow("bus", id);
    for (const id of set.returns.keys()) makeRow("return", id);
    makeRow("master", "master");
  };

  const draw = (): void => {
    const set = currentMeterSet();
    if (set !== lastSet) {
      lastSet = set;
      rebuild(set);
    }
    for (const row of rows) {
      if (!readCurrent(row.kind, row.id, reading)) {
        for (let i = 0; i < row.cells.length; i++) setText(row.cells[i], row.last, i, "");
        continue;
      }
      setText(row.cells[0], row.last, 0, reading.peakLDb.toFixed(1));
      setText(row.cells[1], row.last, 1, reading.peakRDb.toFixed(1));
      setText(row.cells[2], row.last, 2, reading.vuL.toFixed(1));
      setText(row.cells[3], row.last, 3, reading.vuR.toFixed(1));
      setText(row.cells[4], row.last, 4, reading.corr === null ? "-" : reading.corr.toFixed(1));
      setText(row.cells[5], row.last, 5, reading.over ? "1" : "0");
    }
  };

  const tick = (): void => {
    draw();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    table.remove();
  };
}
