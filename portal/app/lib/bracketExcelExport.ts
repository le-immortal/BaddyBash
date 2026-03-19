/**
 * Visual Bracket Excel Export
 *
 * Generates an Excel file that renders the tournament bracket as a tree,
 * mirroring the on-screen BracketVisualizer layout.
 *
 * Layout:
 *   - Each round occupies one data column (player/team names) and one narrow
 *     connector column (bracket lines drawn with cell borders).
 *   - Rows double in spacing per round so that each match is vertically
 *     centred between the two feeder matches from the previous round.
 *   - For large draws (>16 first-round matches) the bracket is split into
 *     sections of 16 first-round matches per sheet, plus a "Final Rounds"
 *     sheet for the remaining knockout rounds.
 */

import ExcelJS from 'exceljs';
import { MatchDocument, Category, CATEGORIES } from './models';

// ── Configuration ─────────────────────────────────────────────────────
/** Max first-round matches per sheet. Must be a power of 2. */
const SECTION_SIZE = 16;
const BASE_SLOT   = 2;     // row-spacing unit for the first round
const HEADER_ROWS = 3;     // title · round-headers · gap

// ── Colour palette ────────────────────────────────────────────────────
const CLR = {
  headerBg:       'FF1E3A5F',
  headerText:     'FFFFFFFF',
  roundHeaderBg:  'FF2D4A7A',
  roundHeaderText:'FFFFFFFF',
  winnerBg:       'FFDCFCE7',
  winnerText:     'FF166534',
  byeBg:          'FFF1F5F9',
  byeText:        'FF94A3B8',
  entryBg:        'FFFFFFFF',
  entryText:      'FF1E293B',
  matchNumText:   'FF94A3B8',
  connectorLine:  'FF64748B',
};

const THIN: Partial<ExcelJS.Border> =
  { style: 'thin',   color: { argb: 'FF94A3B8' } };
const CONNECTOR: Partial<ExcelJS.Border> =
  { style: 'thin',   color: { argb: CLR.connectorLine } };

// ── Row-position maths ────────────────────────────────────────────────
//
// For a **rendering round index** `ri` (0-based) and match index `mi`:
//   blockH  = BASE_SLOT * 2^(ri+1)
//   p1Row   = mi * blockH  + blockH/2 - 1          (0-indexed)
//   p2Row   = p1Row + 1
//   midRow  = mi * blockH  + blockH/2               (= p2Row, used for connectors)
//
function matchP1Row(ri: number, mi: number): number {
  const block = BASE_SLOT * Math.pow(2, ri + 1);
  return mi * block + block / 2 - 1;
}
function matchP2Row(ri: number, mi: number): number {
  return matchP1Row(ri, mi) + 1;
}

// ── Helpers ───────────────────────────────────────────────────────────
function getRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semis';
  if (fromEnd === 2) return 'Quarters';
  return `Round ${round}`;
}

function formatEntry(
  name: string | undefined,
  seed: number | undefined,
  isBye: boolean,
): string {
  if (isBye && !name) return 'BYE';
  if (!name) return 'TBD';
  return seed ? `[${seed}] ${name}` : name;
}

function getCategoryName(cat: Category): string {
  return CATEGORIES.find(c => c.id === cat)?.name ?? cat;
}

// ── Public entry-point ────────────────────────────────────────────────

export async function exportVisualBracket(
  matches: MatchDocument[],
  category: Category,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BaddyBash Portal';

  // Group by round, sort by position
  const roundMap = new Map<number, MatchDocument[]>();
  for (const m of matches) {
    const list = roundMap.get(m.round) ?? [];
    list.push(m);
    roundMap.set(m.round, list);
  }
  roundMap.forEach(list => list.sort((a, b) => a.position - b.position));

  const totalRounds = Math.max(...matches.map(m => m.round));
  const firstRoundCount = (roundMap.get(1) ?? []).length;

  if (firstRoundCount === 0) {
    throw new Error('No bracket data to export');
  }

  const catName = getCategoryName(category);

  if (firstRoundCount <= SECTION_SIZE) {
    // ── Small draw → single sheet ──────────────────────────────────
    renderSheet(
      workbook.addWorksheet(catName),
      roundMap,
      totalRounds,
      catName,
    );
  } else {
    // ── Large draw → sectioned sheets ──────────────────────────────
    const sectionCount  = Math.ceil(firstRoundCount / SECTION_SIZE);
    const sectionRounds = Math.log2(SECTION_SIZE) + 1; // rounds per section

    for (let s = 0; s < sectionCount; s++) {
      const sectionMap = new Map<number, MatchDocument[]>();

      for (let r = 1; r <= Math.min(sectionRounds, totalRounds); r++) {
        const all     = roundMap.get(r) ?? [];
        const perSect = SECTION_SIZE / Math.pow(2, r - 1);
        const start   = s * perSect;
        const chunk   = all
          .filter(m => m.position >= start && m.position < start + perSect)
          .map(m => ({ ...m, position: m.position - start }));  // re-index
        if (chunk.length) sectionMap.set(r, chunk);
      }

      renderSheet(
        workbook.addWorksheet(`Section ${s + 1}`),
        sectionMap,
        totalRounds,                       // keep naming correct (Final / Semis etc.)
        `${catName} — Section ${s + 1} of ${sectionCount}`,
      );
    }

    // ── Final-rounds sheet ─────────────────────────────────────────
    if (sectionRounds < totalRounds) {
      const finalMap = new Map<number, MatchDocument[]>();
      let newR = 1;
      for (let r = Math.floor(sectionRounds) + 1; r <= totalRounds; r++) {
        const list = roundMap.get(r) ?? [];
        if (list.length) {
          finalMap.set(newR, list.map(m => ({ ...m, round: newR })));
          newR++;
        }
      }
      if (finalMap.size) {
        renderSheet(
          workbook.addWorksheet('Final Rounds'),
          finalMap,
          finalMap.size,                   // self-contained naming
          `${catName} — Final Rounds`,
        );
      }
    }
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

// ── Sheet renderer ────────────────────────────────────────────────────

function renderSheet(
  ws: ExcelJS.Worksheet,
  roundMap: Map<number, MatchDocument[]>,
  totalRoundsForNaming: number,
  title: string,
) {
  const roundNums     = Array.from(roundMap.keys()).sort((a, b) => a - b);
  const firstRound    = roundNums[0];
  const firstCount    = (roundMap.get(firstRound) ?? []).length;
  const contentRows   = firstCount * BASE_SLOT * 2;   // 0-indexed row count
  const totalExcelRows = contentRows + HEADER_ROWS + 2;

  // Default row height
  for (let r = 1; r <= totalExcelRows; r++) ws.getRow(r).height = 16;

  // ── Title row ────────────────────────────────────────────────────
  ws.getRow(1).height = 28;
  const totalCols = roundNums.length * 2;
  if (totalCols > 1) ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `🏸 ${title}`;
  titleCell.font  = { bold: true, size: 13, color: { argb: CLR.headerText } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Round headers ────────────────────────────────────────────────
  ws.getRow(2).height = 22;
  for (let i = 0; i < roundNums.length; i++) {
    const dataCol = i * 2 + 1;
    const connCol = i * 2 + 2;
    ws.getColumn(dataCol).width = 26;
    ws.getColumn(connCol).width = 4;

    const hdr = ws.getCell(2, dataCol);
    hdr.value = getRoundName(roundNums[i], totalRoundsForNaming);
    hdr.font  = { bold: true, size: 10, color: { argb: CLR.roundHeaderText } };
    hdr.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.roundHeaderBg } };
    hdr.alignment = { horizontal: 'center', vertical: 'middle' };

    const ch = ws.getCell(2, connCol);
    ch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.roundHeaderBg } };
  }

  // ── Render each round ────────────────────────────────────────────
  roundNums.forEach((roundNum, ri) => {
    const roundMatches = roundMap.get(roundNum) ?? [];
    const dataCol  = ri * 2 + 1;
    const connCol  = ri * 2 + 2;
    const isLast   = ri === roundNums.length - 1;

    roundMatches.forEach((match, mi) => {
      const p1_0 = matchP1Row(ri, mi);
      const p2_0 = matchP2Row(ri, mi);
      const p1   = p1_0 + HEADER_ROWS + 1;   // Excel 1-indexed + header offset
      const p2   = p2_0 + HEADER_ROWS + 1;

      const isBye   = match.status === 'bye';
      const isDone  = match.status === 'completed';
      const p1Win   = isDone && match.winnerId === match.player1Id;
      const p2Win   = isDone && match.winnerId === match.player2Id;

      // ·· Match number label (one row above P1) ···················
      if (match.matchNumber && p1 - 1 > HEADER_ROWS) {
        const lbl = ws.getCell(p1 - 1, dataCol);
        // Only write if the cell is empty (avoid overwriting data)
        if (!lbl.value) {
          lbl.value = `M${match.matchNumber}`;
          lbl.font  = { size: 7, italic: true, color: { argb: CLR.matchNumText } };
          lbl.alignment = { horizontal: 'right', vertical: 'bottom' };
        }
      }

      // ·· Player 1 cell ···········································
      writeEntryCell(ws.getCell(p1, dataCol), {
        text:    formatEntry(match.player1Name, match.player1Seed, isBye),
        isWin:   p1Win,
        isBye:   isBye && !match.player1Name,
        topBorder: true,
      });

      // ·· Player 2 cell ···········································
      writeEntryCell(ws.getCell(p2, dataCol), {
        text:    formatEntry(match.player2Name, match.player2Seed, isBye),
        isWin:   p2Win,
        isBye:   isBye && !match.player2Name,
        topBorder: false,
      });

      // ·· Bracket connector lines ·································
      if (!isLast) {
        drawConnector(ws, p1, p2, connCol);
      }
    });

    // ·· Inter-pair connectors (vertical + horizontal stub) ·······
    if (!isLast) {
      // Each pair of consecutive matches feeds one match in the next round.
      const pairCount = Math.floor(roundMatches.length / 2);
      for (let p = 0; p < pairCount; p++) {
        const topMi  = p * 2;
        const botMi  = p * 2 + 1;

        const topP2  = matchP2Row(ri, topMi)  + HEADER_ROWS + 1;
        const botP1  = matchP1Row(ri, botMi)  + HEADER_ROWS + 1;

        // Vertical line from bottom of top match to top of bottom match
        for (let row = topP2 + 1; row < botP1; row++) {
          const c = ws.getCell(row, connCol);
          c.border = mergeBorder(c.border, { right: CONNECTOR });
        }

        // Horizontal stub at the midpoint → entry of next-round match
        const midRow = Math.floor((topP2 + botP1) / 2);
        const c = ws.getCell(midRow, connCol);
        c.border = mergeBorder(c.border, { right: CONNECTOR, bottom: CONNECTOR });
      }
    }
  });

  // ── Champion label (after the final) ─────────────────────────────
  const lastRound  = roundNums[roundNums.length - 1];
  const finalMatch = (roundMap.get(lastRound) ?? [])[0];
  if (finalMatch?.winnerName) {
    const champCol = roundNums.length * 2 + 1;
    ws.getColumn(champCol).width = 28;
    const p1_0 = matchP1Row(roundNums.length - 1, 0);
    const champRow = p1_0 + HEADER_ROWS + 1;

    const hdr = ws.getCell(2, champCol);
    hdr.value = '🏆 Champion';
    hdr.font  = { bold: true, size: 10, color: { argb: CLR.roundHeaderText } };
    hdr.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.roundHeaderBg } };
    hdr.alignment = { horizontal: 'center', vertical: 'middle' };

    const cell = ws.getCell(champRow, champCol);
    cell.value = finalMatch.winnerName;
    cell.font  = { bold: true, size: 11, color: { argb: CLR.winnerText } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.winnerBg } };
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // ── Freeze panes (headers) ───────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];
}

// ── Cell writers ──────────────────────────────────────────────────────

interface EntryCellOpts {
  text: string;
  isWin: boolean;
  isBye: boolean;
  topBorder: boolean;   // true for P1 (top of match box), false for P2
}

function writeEntryCell(cell: ExcelJS.Cell, o: EntryCellOpts) {
  cell.value = o.text;
  cell.font = {
    size: 9,
    bold: o.isWin,
    color: {
      argb: o.isBye ? CLR.byeText : o.isWin ? CLR.winnerText : CLR.entryText,
    },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb: o.isWin ? CLR.winnerBg : o.isBye ? CLR.byeBg : CLR.entryBg,
    },
  };
  cell.border = {
    top:    THIN,
    bottom: THIN,
    left:   THIN,
    right:  THIN,
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

/**
 * Draw the right-angle connector bracket from one match to its pair.
 *
 * For a single match's two entries at p1Row and p2Row:
 *   p1Row  ──┐
 *            │    (right border on connector-column cells)
 *   p2Row  ──┘
 */
function drawConnector(
  ws: ExcelJS.Worksheet,
  p1Row: number,
  p2Row: number,
  connCol: number,
) {
  // Horizontal stubs from match box into the connector column
  const topCell = ws.getCell(p1Row, connCol);
  topCell.border = mergeBorder(topCell.border, { bottom: CONNECTOR });

  const botCell = ws.getCell(p2Row, connCol);
  botCell.border = mergeBorder(botCell.border, { bottom: CONNECTOR });

  // Vertical line between the two horizontal stubs
  for (let row = p1Row + 1; row <= p2Row; row++) {
    const c = ws.getCell(row, connCol);
    c.border = mergeBorder(c.border, { right: CONNECTOR });
  }
}

// ── Border helper ─────────────────────────────────────────────────────

function mergeBorder(
  existing: Partial<ExcelJS.Borders> | undefined,
  additions: Partial<ExcelJS.Borders>,
): Partial<ExcelJS.Borders> {
  return { ...(existing ?? {}), ...additions };
}
