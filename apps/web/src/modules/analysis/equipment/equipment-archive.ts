import { equipmentSymptomKeys, type EquipmentHistoryRecord } from "@skatingx/skating-domain";

/** Per-user browser archive. Not the legacy `blaze-equipment-history-v1` key. */
const KEY_PREFIX = "skatingx-equipment-history-v1:";
const ARCHIVE_LIMIT = 30;

const symptomKeys = new Set<string>(equipmentSymptomKeys);

export function equipmentArchiveKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function isArchiveRecord(value: unknown): value is EquipmentHistoryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as EquipmentHistoryRecord;
  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.symptomKey === "string" &&
    symptomKeys.has(record.symptomKey) &&
    record.athleteId === "lindsay"
  );
}

export function readEquipmentArchive(storage: Storage, userId: string): EquipmentHistoryRecord[] {
  try {
    const raw = storage.getItem(equipmentArchiveKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isArchiveRecord).slice(0, ARCHIVE_LIMIT);
  } catch {
    // A corrupt archive should not block the cloud list. The next successful save replaces it.
    return [];
  }
}

/** Cloud records win when the same id exists in both places. Newest first, capped at 30. */
export function mergeEquipmentHistory(
  cloud: readonly EquipmentHistoryRecord[],
  local: readonly EquipmentHistoryRecord[],
): EquipmentHistoryRecord[] {
  const byId = new Map<string, EquipmentHistoryRecord>();
  for (const record of local) byId.set(record.id, record);
  for (const record of cloud) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ARCHIVE_LIMIT);
}

export function rememberEquipmentRecord(
  storage: Storage,
  userId: string,
  record: EquipmentHistoryRecord,
): EquipmentHistoryRecord[] {
  const next = mergeEquipmentHistory(readEquipmentArchive(storage, userId), [record]);
  storage.setItem(equipmentArchiveKey(userId), JSON.stringify(next));
  return next;
}

export function forgetEquipmentRecord(storage: Storage, userId: string, recordId: string): EquipmentHistoryRecord[] {
  const next = readEquipmentArchive(storage, userId).filter((record) => record.id !== recordId);
  storage.setItem(equipmentArchiveKey(userId), JSON.stringify(next));
  return next;
}
