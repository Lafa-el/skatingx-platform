/**
 * Read-only inventory of the V2.0 training workbook.
 *
 * The workbook has no Drill to Exercise edge. Each drill records an empty
 * exerciseRefs list and exerciseRefsSource "source_not_provided". Names, tags,
 * and guesses must not invent that link.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_DIR = path.join("docs", "skatingx-v2", "source");
const INVENTORY_DIR = path.join("docs", "skatingx-v2", "inventory");
const WORKBOOK_FILE = "SkatingX_Youth_Training_Knowledge_Exercise_Library_V2.0_Brand_Aligned.xlsx";
const MANIFEST_FILE = "SkatingX_V2.0_Preservation_Manifest.json";

export const LIBRARY_SHA256 = "15e36d07501eaa514fc74a069060a56e1b387df8825f3369f1966112c93b180b";

const EXPECTED_SHEETS = 51;
const EXPECTED_SECTIONS = 16;
const EXPECTED_OBJECTIVES = 22;
const EXPECTED_BLOCK_DRILL_REFS = 115;
const EXPECTED_SESSION_BLOCK_REFS = 57;
const EXPECTED_CONDITIONAL = 4;
const EXPECTED_PROD_ROWS = 51;
const UNMAPPED_BLOCK_IDS = ["BL-L031", "BL-I017"];

const OBJECT_SPECS = [
  {
    key: "exercises",
    sheet: "06_Exercises",
    count: 120,
    columns: {
      "Exercise ID": "id",
      "English Name": "nameEn",
      "中文名称": "nameZh",
      Environment: "environment",
      "Section ID": "sectionId",
      "Primary Objective": "primaryObjectiveId",
      "Focus Tags": "focusTags",
      Modality: "modality",
      Equipment: "equipment",
      "Youth Default": "youthDefault",
      Supervision: "supervision",
    },
    listFields: [],
  },
  {
    key: "drills",
    sheet: "07_Drills",
    count: 68,
    columns: {
      "Drill ID": "id",
      "English Name": "nameEn",
      "中文名称": "nameZh",
      Env: "environment",
      Section: "sectionId",
      "Primary Obj": "primaryObjectiveId",
      "Secondary Obj": "secondaryObjectiveIds",
      Energy: "energySystemId",
      "Focus Tags": "focusTags",
      Modality: "modality",
      "Default Sets": "defaultSets",
      "Default Reps": "defaultReps",
      Distance: "distance",
      Duration: "duration",
      Target: "target",
      Rest: "rest",
      RPE: "rpe",
      Load: "load",
      "Taper Compatible": "taperCompatible",
      Supervision: "supervision",
    },
    listFields: ["secondaryObjectiveIds"],
  },
  {
    key: "blocks",
    sheet: "08_Blocks",
    count: 51,
    columns: {
      "Block ID": "id",
      "English Name": "nameEn",
      "中文名称": "nameZh",
      Env: "environment",
      "Primary Section": "sectionId",
      "Primary Obj": "primaryObjectiveId",
      "Secondary Obj": "secondaryObjectiveIds",
      "Drill IDs": "drillRefs",
      Duration: "duration",
      Load: "load",
      "Taper Compatible": "taperCompatible",
    },
    listFields: ["secondaryObjectiveIds", "drillRefs"],
  },
  {
    key: "sessions",
    sheet: "09_Sessions",
    count: 18,
    columns: {
      "Session ID": "id",
      "English Name": "nameEn",
      "中文名称": "nameZh",
      "Training Phase": "trainingPhase",
      Env: "environment",
      "Block IDs": "blockRefs",
      Duration: "duration",
      Load: "load",
      "Primary Goal": "primaryGoal",
      "Taper Compatible": "taperCompatible",
    },
    listFields: ["blockRefs"],
  },
];

export { OBJECT_SPECS };

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function stableJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortValue(value[key]);
    return sorted;
  }
  return value;
}

function cellString(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (typeof cell.v === "string") return cell.v.trim();
  return String(cell.v).trim();
}

function splitList(value) {
  if (!value) return [];
  return value.split(";").map((part) => part.trim()).filter((part) => part.length > 0);
}

function readTable(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    headers.push(cellString(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]));
  }
  const rows = [];
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const values = headers.map((_, index) => cellString(sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + index })]));
    if (values.every((value) => value === "")) continue;
    const cells = new Map();
    headers.forEach((header, index) => {
      if (header === "") return;
      cells.set(header, values[index]);
    });
    rows.push({ row: row + 1, cells });
  }
  return { headers, rows };
}

function scanSpecial(sheet) {
  const formulas = [];
  let errors = 0;
  if (!sheet || !sheet["!ref"]) return { formulas, errors };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      if (cell.f) formulas.push({ address: XLSX.utils.encode_cell({ r: row, c: column }), formula: cell.f });
      if (cell.t === "e") errors += 1;
    }
  }
  return { formulas, errors };
}

function blankColumns(sheet) {
  if (!sheet || !sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const blanks = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    let header = "";
    let any = false;
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      const text = cellString(cell);
      if (row === range.s.r) header = text;
      if (text !== "" || (cell && (cell.f || cell.t === "e"))) any = true;
    }
    if (!any) blanks.push({ column: column + 1, header });
  }
  return blanks;
}

function recordFromRow(row, spec) {
  const listFields = new Set(spec.listFields);
  const record = {};
  const legacyAttributes = {};
  for (const [header, value] of row.cells) {
    const field = spec.columns[header];
    if (!field) {
      legacyAttributes[header] = value;
      continue;
    }
    record[field] = listFields.has(field) ? splitList(value) : value;
  }
  record.legacyAttributes = legacyAttributes;
  record.source = { sheet: spec.sheet, row: row.row };
  return record;
}

function pushFailure(failures, message) {
  failures.push(message);
}

function requireCount(failures, label, actual, expected) {
  if (actual !== expected) pushFailure(failures, `${label} count ${actual}, expected ${expected}`);
}

function uniqueIds(failures, records, label) {
  const seen = new Set();
  for (const record of records) {
    if (record.id === "") pushFailure(failures, `${label} row ${record.source.row} has an empty id`);
    if (record.nameEn === "" || record.nameZh === "") {
      pushFailure(failures, `${label} ${record.id || record.source.row} has an empty name`);
    }
    if (record.id !== "" && seen.has(record.id)) pushFailure(failures, `${label} duplicate id ${record.id}`);
    seen.add(record.id);
  }
  return seen;
}

function countResolved(failures, records, field, universe, label) {
  let total = 0;
  for (const record of records) {
    const value = record[field];
    const tokens = Array.isArray(value) ? value : splitList(value);
    if (tokens.length === 0) {
      pushFailure(failures, `${record.source.sheet} row ${record.source.row} ${label} is empty`);
    }
    for (const token of tokens) {
      total += 1;
      if (!universe.has(token)) {
        pushFailure(failures, `${record.source.sheet} row ${record.source.row} ${label} ${token} is unresolved`);
      }
    }
  }
  return total;
}

export function buildCatalog(root = ROOT) {
  const failures = [];
  const workbookPath = path.join(root, SOURCE_DIR, WORKBOOK_FILE);
  const manifestPath = path.join(root, SOURCE_DIR, MANIFEST_FILE);
  const workbookBytes = readFileSync(workbookPath);
  const manifestBytes = readFileSync(manifestPath);
  const workbookSha256 = sha256(workbookBytes);
  const manifestSha256 = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));

  if (workbookSha256 !== LIBRARY_SHA256 || manifest.librarySha256 !== LIBRARY_SHA256) {
    pushFailure(failures, `workbook sha256 ${workbookSha256} does not match manifest librarySha256 ${manifest.librarySha256}`);
    return { inventory: null, exceptions: null, failures };
  }

  const workbook = XLSX.read(workbookBytes, { type: "buffer", cellFormula: true });
  requireCount(failures, "sheets", workbook.SheetNames.length, EXPECTED_SHEETS);
  if (manifest.librarySheetNames && JSON.stringify(workbook.SheetNames) !== JSON.stringify(manifest.librarySheetNames)) {
    pushFailure(failures, "workbook sheet names do not match the manifest");
  }

  const sectionTable = readTable(workbook.Sheets["01_Sections"]);
  const objectiveTable = readTable(workbook.Sheets["02_Objectives"]);
  const sectionIds = uniqueIds(failures, sectionTable.rows.map((row) => ({
    id: row.cells.get("Section ID") ?? "",
    nameEn: row.cells.get("English") ?? "",
    nameZh: row.cells.get("中文") ?? "",
    source: { sheet: "01_Sections", row: row.row },
  })), "sections");
  const objectiveIds = uniqueIds(failures, objectiveTable.rows.map((row) => ({
    id: row.cells.get("Objective ID") ?? "",
    nameEn: row.cells.get("English") ?? "",
    nameZh: row.cells.get("中文") ?? "",
    source: { sheet: "02_Objectives", row: row.row },
  })), "objectives");
  requireCount(failures, "sections", sectionIds.size, EXPECTED_SECTIONS);
  requireCount(failures, "objectives", objectiveIds.size, EXPECTED_OBJECTIVES);

  const objects = {};
  for (const spec of OBJECT_SPECS) {
    const sheet = workbook.Sheets[spec.sheet];
    const table = readTable(sheet);
    if (table.headers[0] !== Object.entries(spec.columns)[0][0]) {
      pushFailure(failures, `${spec.sheet} id column is not first`);
    }
    const seenHeaders = new Set();
    for (const header of table.headers) {
      if (header === "") continue;
      if (seenHeaders.has(header)) pushFailure(failures, `${spec.sheet} duplicate header ${header}`);
      seenHeaders.add(header);
    }
    const special = scanSpecial(sheet);
    requireCount(failures, `${spec.sheet} formulas`, special.formulas.length, 0);
    requireCount(failures, `${spec.sheet} errors`, special.errors, 0);
    const records = table.rows.map((row) => recordFromRow(row, spec));
    requireCount(failures, spec.key, records.length, spec.count);
    uniqueIds(failures, records, spec.key);
    objects[spec.key] = records;
  }

  for (const exercise of objects.exercises) {
    if (exercise.youthDefault === "Conditional") exercise.safetyFlag = "review_required";
  }
  for (const drill of objects.drills) {
    drill.exerciseRefs = [];
    drill.exerciseRefsSource = "source_not_provided";
  }

  const conditional = objects.exercises.filter((exercise) => exercise.safetyFlag === "review_required");
  requireCount(failures, "conditional exercises", conditional.length, EXPECTED_CONDITIONAL);

  const drillIds = new Set(objects.drills.map((drill) => drill.id));
  const blockIds = new Set(objects.blocks.map((block) => block.id));
  const blockDrillRefs = countResolved(failures, objects.blocks, "drillRefs", drillIds, "Drill ID");
  const sessionBlockRefs = countResolved(failures, objects.sessions, "blockRefs", blockIds, "Block ID");
  requireCount(failures, "block drill refs", blockDrillRefs, EXPECTED_BLOCK_DRILL_REFS);
  requireCount(failures, "session block refs", sessionBlockRefs, EXPECTED_SESSION_BLOCK_REFS);
  countResolved(failures, objects.exercises, "sectionId", sectionIds, "Section ID");
  countResolved(failures, objects.drills, "sectionId", sectionIds, "Section");
  countResolved(failures, objects.drills, "primaryObjectiveId", objectiveIds, "Primary Obj");

  const mappingSheet = "21_V1.2_ProdMapping";
  const mapping = readTable(workbook.Sheets[mappingSheet]);
  requireCount(failures, "prod mapping rows", mapping.rows.length, EXPECTED_PROD_ROWS);
  const templateByBlock = new Map();
  for (const row of mapping.rows) {
    const id = row.cells.get("Master Block ID") ?? "";
    const template = row.cells.get("systemTemplateId") ?? "";
    if (templateByBlock.has(id)) pushFailure(failures, `${mappingSheet} duplicate block ${id}`);
    templateByBlock.set(id, template === "" ? null : template);
  }
  for (const block of objects.blocks) {
    if (!templateByBlock.has(block.id)) {
      pushFailure(failures, `${mappingSheet} has no row for ${block.id}`);
      block.legacyAttributes.systemTemplateId = null;
      continue;
    }
    const template = templateByBlock.get(block.id);
    if (template !== null && !template.startsWith("stb_")) {
      pushFailure(failures, `${block.id} systemTemplateId ${template} does not start with stb_`);
    }
    block.legacyAttributes.systemTemplateId = template;
  }
  const unmapped = objects.blocks.filter((block) => block.legacyAttributes.systemTemplateId === null).map((block) => block.id);
  if (unmapped.join(",") !== UNMAPPED_BLOCK_IDS.join(",")) {
    pushFailure(failures, `unmapped blocks ${unmapped.join(", ")}`);
  }

  const mappingSpecial = scanSpecial(workbook.Sheets[mappingSheet]);
  const blankBySheet = workbook.SheetNames.map((sheetName) => ({
    blankColumns: blankColumns(workbook.Sheets[sheetName]),
    sheet: sheetName,
  }));

  const exceptions = {
    gaps: [
      {
        code: "drill_exercise_edge_missing",
        count: objects.drills.length,
        detail: "source_not_provided",
        edge: "Drill→Exercise",
      },
      {
        code: "block_system_template_id_missing",
        ids: unmapped,
      },
      {
        code: "exercise_conditional_review_required",
        ids: conditional.map((exercise) => exercise.id),
        safetyFlag: "review_required",
      },
    ],
    notes: [
      {
        detail: "历史表公式，非对象数据",
        formulas: mappingSpecial.formulas.map((formula) => ({
          address: formula.address,
          formula: formula.formula,
          sheet: mappingSheet,
        })),
        sheet: mappingSheet,
      },
      { blankColumns: blankBySheet },
    ],
  };
  if (failures.length > 0) {
    exceptions.gaps.push({ code: "integrity_failure", messages: failures });
  }

  return {
    exceptions,
    failures,
    inventory: {
      manifestSha256,
      objects,
      sheetCount: workbook.SheetNames.length,
      workbookSha256,
    },
  };
}

function printSummary(catalog) {
  const { blocks, drills, exercises, sessions } = catalog.inventory.objects;
  const drillRefs = blocks.reduce((sum, block) => sum + block.drillRefs.length, 0);
  const blockRefs = sessions.reduce((sum, session) => sum + session.blockRefs.length, 0);
  const conditional = exercises.filter((exercise) => exercise.safetyFlag === "review_required").length;
  const unmapped = blocks.filter((block) => block.legacyAttributes.systemTemplateId === null).length;
  console.log([
    `sheets=${catalog.inventory.sheetCount} exercises=${exercises.length} drills=${drills.length} blocks=${blocks.length} sessions=${sessions.length}`,
    `blockDrillRefs=${drillRefs} sessionBlockRefs=${blockRefs}`,
    `conditional=${conditional} unmappedBlocks=${unmapped}`,
    `workbookSha256=${catalog.inventory.workbookSha256}`,
    "wrote docs/skatingx-v2/inventory/workbook-inventory.json",
    "wrote docs/skatingx-v2/inventory/workbook-exceptions.json",
  ].join("\n"));
}

function writeCatalog(root, catalog) {
  const dir = path.join(root, INVENTORY_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "workbook-inventory.json"), stableJson(catalog.inventory));
  writeFileSync(path.join(dir, "workbook-exceptions.json"), stableJson(catalog.exceptions));
}

function main() {
  const catalog = buildCatalog(ROOT);
  if (!catalog.inventory) {
    for (const message of catalog.failures) console.error(message);
    process.exitCode = 1;
    return;
  }
  writeCatalog(ROOT, catalog);
  printSummary(catalog);
  if (catalog.failures.length > 0) {
    for (const message of catalog.failures) console.error(message);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
