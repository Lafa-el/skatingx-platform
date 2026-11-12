import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { OBJECT_SPECS, buildCatalog, stableJson } from "./parse-workbook.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = fileURLToPath(new URL("./parse-workbook.mjs", import.meta.url));
const WORKBOOK = path.join(ROOT, "docs/skatingx-v2/source/SkatingX_Youth_Training_Knowledge_Exercise_Library_V2.0_Brand_Aligned.xlsx");
const MANIFEST = path.join(ROOT, "docs/skatingx-v2/source/SkatingX_V2.0_Preservation_Manifest.json");
const INVENTORY = path.join(ROOT, "docs/skatingx-v2/inventory/workbook-inventory.json");
const EXCEPTIONS = path.join(ROOT, "docs/skatingx-v2/inventory/workbook-exceptions.json");
const LIBRARY_SHA256 = "15e36d07501eaa514fc74a069060a56e1b387df8825f3369f1966112c93b180b";
const CONDITIONAL_IDS = ["EX-L039", "EX-L078", "EX-L079", "EX-L080"];
const UNMAPPED_BLOCKS = ["BL-L031", "BL-I017"];

let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left, right) {
  return left.length === right.length && left.equals(right);
}

function readTable(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    headers.push(cell && cell.v != null ? String(cell.v).trim() : "");
  }
  const rows = [];
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    let any = false;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && cell.v != null && String(cell.v).trim() !== "") any = true;
    }
    if (!any) continue;
    const idCell = sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c })];
    rows.push({ id: idCell && idCell.v != null ? String(idCell.v).trim() : "", row: row + 1 });
  }
  return { headers, rows };
}

function countSpecial(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  let formulas = 0;
  let errors = 0;
  const formulaText = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      if (cell.f) {
        formulas += 1;
        formulaText.push(cell.f);
      }
      if (cell.t === "e") errors += 1;
    }
  }
  return { errors, formulas, formulaText };
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(";").map((part) => part.trim()).filter((part) => part.length > 0);
}

const workbookBytes = readFileSync(WORKBOOK);
const manifestBytes = readFileSync(MANIFEST);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const workbook = XLSX.read(workbookBytes, { type: "buffer", cellFormula: true });
const catalog = buildCatalog(ROOT);
const inventory = catalog.inventory;
const exceptions = catalog.exceptions;

assert(catalog.failures.length === 0, catalog.failures.join("\n"));
assert(sha256(workbookBytes) === LIBRARY_SHA256, "workbook hash");
assert(manifest.librarySha256 === LIBRARY_SHA256, "manifest librarySha256");
assert(inventory.workbookSha256 === LIBRARY_SHA256, "inventory workbook hash");
assert(inventory.manifestSha256 === sha256(manifestBytes), "inventory manifest hash");
assert(inventory.sheetCount === 51, "sheet count");
assert(workbook.SheetNames.length === 51, "workbook sheet count");

const objects = inventory.objects;
assert(objects.exercises.length === 120, "exercises");
assert(objects.drills.length === 68, "drills");
assert(objects.blocks.length === 51, "blocks");
assert(objects.sessions.length === 18, "sessions");

const sectionRows = readTable(workbook.Sheets["01_Sections"]);
const objectiveRows = readTable(workbook.Sheets["02_Objectives"]);
const sectionIds = new Set(sectionRows.rows.map((row) => row.id));
const objectiveIds = new Set(objectiveRows.rows.map((row) => row.id));
assert(sectionIds.size === 16, "section ids");
assert(objectiveIds.size === 22, "objective ids");

for (const spec of OBJECT_SPECS) {
  const table = readTable(workbook.Sheets[spec.sheet]);
  const records = objects[spec.key];
  const special = countSpecial(workbook.Sheets[spec.sheet]);
  assert(special.formulas === 0, `${spec.sheet} formulas`);
  assert(special.errors === 0, `${spec.sheet} errors`);
  assert(table.headers[0] === Object.keys(spec.columns)[0], `${spec.sheet} id header`);
  assert(records.length === table.rows.length, `${spec.key} row count`);
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    assert(record.id !== "", `${spec.key} empty id`);
    assert(!seen.has(record.id), `${spec.key} duplicate ${record.id}`);
    seen.add(record.id);
    assert(record.id === table.rows[index].id, `${spec.key} id order ${record.id}`);
    assert(record.source.sheet === spec.sheet, `${spec.key} source sheet`);
    assert(record.source.row === table.rows[index].row, `${spec.key} source row ${record.id}`);
    assert(record.nameEn.trim() !== "" && record.nameZh.trim() !== "", `${spec.key} ${record.id} name`);
    for (const header of table.headers) {
      if (header === "") continue;
      const field = spec.columns[header];
      if (field) assert(Object.prototype.hasOwnProperty.call(record, field), `${spec.sheet} dropped ${header}`);
      else assert(Object.prototype.hasOwnProperty.call(record.legacyAttributes, header), `${spec.sheet} dropped legacy ${header}`);
    }
  }
}

let blockDrillRefs = 0;
const drillIds = new Set(objects.drills.map((drill) => drill.id));
for (const block of objects.blocks) {
  assert(Array.isArray(block.drillRefs), "drillRefs");
  for (const drillId of block.drillRefs) {
    blockDrillRefs += 1;
    assert(drillIds.has(drillId), `unresolved drill ${drillId}`);
  }
}
assert(blockDrillRefs === 115, "block drill refs");

let sessionBlockRefs = 0;
const blockIds = new Set(objects.blocks.map((block) => block.id));
for (const session of objects.sessions) {
  assert(Array.isArray(session.blockRefs), "blockRefs");
  for (const blockId of session.blockRefs) {
    sessionBlockRefs += 1;
    assert(blockIds.has(blockId), `unresolved block ${blockId}`);
  }
}
assert(sessionBlockRefs === 57, "session block refs");

for (const exercise of objects.exercises) {
  for (const token of splitList(exercise.sectionId)) assert(sectionIds.has(token), `exercise section ${token}`);
}
for (const drill of objects.drills) {
  assert(Array.isArray(drill.exerciseRefs) && drill.exerciseRefs.length === 0, `${drill.id} exerciseRefs`);
  assert(drill.exerciseRefsSource === "source_not_provided", `${drill.id} exerciseRefsSource`);
  assert(!Object.prototype.hasOwnProperty.call(drill, "development"), `${drill.id} development field`);
  for (const token of splitList(drill.sectionId)) assert(sectionIds.has(token), `drill section ${token}`);
  for (const token of splitList(drill.primaryObjectiveId)) assert(objectiveIds.has(token), `drill objective ${token}`);
}

const conditional = objects.exercises.filter((exercise) => exercise.safetyFlag === "review_required");
assert(conditional.length === 4, "conditional count");
assert(conditional.map((exercise) => exercise.id).join(",") === CONDITIONAL_IDS.join(","), "conditional ids");
for (const exercise of objects.exercises) {
  if (exercise.youthDefault === "Conditional") {
    assert(exercise.safetyFlag === "review_required", `${exercise.id} flag`);
    assert(exercise.supervision !== "", `${exercise.id} supervision`);
  } else {
    assert(!Object.prototype.hasOwnProperty.call(exercise, "safetyFlag"), `${exercise.id} unexpected flag`);
  }
}

const unmapped = [];
let mapped = 0;
for (const block of objects.blocks) {
  const template = block.legacyAttributes.systemTemplateId;
  if (template === null) unmapped.push(block.id);
  else {
    mapped += 1;
    assert(typeof template === "string" && template.startsWith("stb_"), `${block.id} template`);
  }
}
assert(mapped === 49, "mapped blocks");
assert(unmapped.join(",") === UNMAPPED_BLOCKS.join(","), "unmapped blocks");

const mappingSpecial = countSpecial(workbook.Sheets["21_V1.2_ProdMapping"]);
assert(mappingSpecial.formulas === 4, "prod mapping formulas");
assert(mappingSpecial.errors === 0, "prod mapping errors");
const formulaNote = exceptions.notes.find((note) => note.detail === "历史表公式，非对象数据");
assert(formulaNote, "formula note");
assert(formulaNote.formulas.length === 4, "formula note count");
assert(formulaNote.formulas.map((item) => item.formula).join("|") === mappingSpecial.formulaText.join("|"), "formula text");
assert(formulaNote.formulas.every((item) => item.sheet === "21_V1.2_ProdMapping"), "formula sheet");

const blankNote = exceptions.notes.find((note) => note.blankColumns);
assert(blankNote.blankColumns.length === 51, "blank column sheets");
const nonZeroBlanks = blankNote.blankColumns.filter((sheet) => sheet.blankColumns.length > 0);
assert(nonZeroBlanks.length === 1 && nonZeroBlanks[0].sheet === "21_V1.2_ProdMapping", "only prod mapping has a blank column");

assert(exceptions.gaps.length === 3, "gap count");
assert(exceptions.gaps[0].edge === "Drill→Exercise" && exceptions.gaps[0].detail === "source_not_provided", "drill edge gap");
assert(exceptions.gaps[1].ids.join(",") === UNMAPPED_BLOCKS.join(","), "unmapped gap");
assert(exceptions.gaps[2].ids.join(",") === CONDITIONAL_IDS.join(",") && exceptions.gaps[2].safetyFlag === "review_required", "conditional gap");
assert(!stableJson(inventory).includes("2026-") && !stableJson(exceptions).includes("generatedAt"), "no timestamp");

const inventoryBytes = Buffer.from(stableJson(inventory), "utf8");
const exceptionBytes = Buffer.from(stableJson(exceptions), "utf8");
assert(sameBytes(readFileSync(INVENTORY), inventoryBytes), "inventory bytes drifted from buildCatalog");
assert(sameBytes(readFileSync(EXCEPTIONS), exceptionBytes), "exception bytes drifted from buildCatalog");

function runParser() {
  return spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8" });
}

const first = runParser();
assert(first.status === 0, first.stderr || "first parser run failed");
assert(first.stderr === "", "first run wrote to stderr");
const afterFirstInventory = readFileSync(INVENTORY);
const afterFirstExceptions = readFileSync(EXCEPTIONS);
const second = runParser();
assert(second.status === 0, second.stderr || "second parser run failed");
assert(sameBytes(afterFirstInventory, readFileSync(INVENTORY)), "inventory changed between runs");
assert(sameBytes(afterFirstExceptions, readFileSync(EXCEPTIONS)), "exceptions changed between runs");
assert(sameBytes(afterFirstInventory, inventoryBytes), "inventory does not match the committed file");
assert(sameBytes(afterFirstExceptions, exceptionBytes), "exceptions do not match the committed file");
assert(sha256(afterFirstInventory) === sha256(readFileSync(INVENTORY)), "inventory sha");
assert(sha256(readFileSync(WORKBOOK)) === LIBRARY_SHA256, "parser rewrote the workbook");

console.log(`parse-workbook.test.mjs ok assertions=${assertions}`);
