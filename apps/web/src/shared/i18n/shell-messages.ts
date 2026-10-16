import { createTranslator, type Resources } from "./translator";

/**
 * Text of the shared shell: the athlete menu in the header, the data status line, and the
 * placeholder page. Pages have their own resources.
 */
const zh = {
  "shell.status.loading": "正在加载你的数据…",
  // `{detail}` is the technical reason from the data service, shown as it arrives so a problem can
  // be reported. "Firestore" is a product name and is not translated.
  "shell.status.connectError": "无法连接到 Firestore:{detail}",

  "shell.athlete.listLabel": "选择运动员",
  "shell.athlete.active": "当前",
  "shell.athlete.switchingLater": "多运动员切换:后续阶段提供。",
  "shell.athlete.profileLink": "运动员档案 →",

  "shell.placeholder.default": "占位页面:原有功能将在后续阶段迁移。",
} as const;

type ShellKey = keyof typeof zh;

const en: Record<ShellKey, string> = {
  "shell.status.loading": "Loading your data…",
  "shell.status.connectError": "Unable to connect to Firestore: {detail}",

  "shell.athlete.listLabel": "Select athlete",
  "shell.athlete.active": "Active",
  "shell.athlete.switchingLater": "Multi-athlete switching — coming in a later phase.",
  "shell.athlete.profileLink": "Athlete profile →",

  "shell.placeholder.default": "Placeholder page — legacy logic will be migrated in a later phase.",
};

export type ShellMessageKey = ShellKey;

export const shellResources: Resources<ShellKey> = { zh, en };

export const tShell = createTranslator(shellResources);
