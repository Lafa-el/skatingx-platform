import { getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentHash, reviewKnowledgeArticle } from "../../scripts/catalog/trusted-flow.mjs";

const PROJECT_ID = "demo-skatingx-import";
const ROOT = "artifacts/skatingx-production";
const ARTICLES = `${ROOT}/trainingCatalogKnowledgeArticles`;
const AUDIT = `${ROOT}/trainingCatalogAuditLogs`;
const CREATED = "2026-11-17T00:00:00.000Z";
const REVIEWER = "reviewer-1";

const SOURCES = [
  {
    type: "official_rule",
    id: "ISU-ST-2026",
    title: "ISU Short Track Sport Rules 2026",
    url: "https://isudam.blob.core.windows.net/isudamcontainer/2026-Short-Track-Sport-Rules-20260513-FINAL-as-of-1-June-2026-1780065543-3994.pdf",
    refs: ["Rule 280", "Rule 286", "Rule 288", "Rule 294"],
    verifiedAt: "2026-11-17",
  },
  {
    type: "official_rule",
    id: "USS-ST-2026-27",
    title: "US Speedskating Short Track Rules & Regulations 2026-2027 V1",
    url: "https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt1543057d67b57617/6aa08e5137d7f3733b8eb4c2/2026-27_ST_Regs_V1.pdf",
    refs: ["§1.A", "§1.J", "§1.K"],
    verifiedAt: "2026-11-17",
  },
];

// Sections 1–2 of the revised draft (p3-article-draft-youth-pre-ice-check-2.md).
const BODY_ZH = `一、装备检查

1. 头盔
检查：安全型头盔，符合现行 ASTM 短道标准（或 ISU 批准的其他标准）；形状规则、无突出物；系带系紧。
官方依据：ISU Rule 288 para 1.a（2026 ISU Short Track Sport Rules）；USS 2026–27 Section J.2（所有运动员须佩戴符合现行 ASTM 短道标准的头盔，形状规则、无突出物、系带系紧）。
适用范围：ISU 赛事/冬奥会/青奥会“必须”；国际比赛“应当”；USS 所有赛事。个性化头盔图案见 ISU Communication 2799（USS J.2 引用）。

2. 手套
检查：防切割手套或连指手套；ISU 赛事/冬奥会/青奥会须以白色为主。USS §1.J.3：所有参赛者佩戴以白色为主的 Level 3 防切割手套（按 ISU Communication 2810）。
官方依据：ISU Rule 288 para 1.b；USS 2026–27 §1.J.3（按 ISU Rule 288 与 ISU Comm 2810）。
适用范围：ISU 赛事/冬奥会/青奥会（白色）；USS 所有参赛者（Level 3，以白色为主）。地方/俱乐部赛的手套要求按赛事公告执行（防切割服的分级要求见第 4 条）。

3. 护腿
检查：佩戴护腿。
官方依据：ISU Rule 288 para 1.c；USS 2026–27 Section J.5。
适用范围：ISU 赛事/冬奥会/青奥会“必须”；国际比赛“应当”；USS 所有运动员。

4. 长袖长裤与防切割服装
检查：长袖长裤服装（按现行 ISU Communication）。USS §1.J.1：全身防切割服（融入速滑服或单独内衣），等级按赛事级别分级：
- 选拔赛（USS Selection competitions）：强制最低要求——全身 Level 3 防切割服 + Level 3 防切割手套。
- 年龄组全国赛（Age Group Nationals）：强制最低要求——全身 Level 2 防切割服；强烈推荐全身 Level 3。
- 地区/俱乐部赛（Regional/club competitions）：强烈推荐最低——全身 Level 2 防切割服。
官方依据：ISU Rule 288 para 1.d（长袖长裤服装按现行 ISU Communication）；USS 2026–27 §1.J.1（遵循 ISU Communication 2810 的 2026–2027 赛季装备指引）。
适用范围：§1.J.1 按赛事级别分级的是防切割服（手套见第 2 条 §1.J.3）。防切割等级因赛事级别而异，须按该赛事的公告执行。地方赛如有变更或豁免，按 §1.A 查赛前公布文件或报名表。日常训练的防切割要求按俱乐部公布执行，不直接套用竞赛等级。

5. 护膝
检查：护垫或硬壳护膝。
官方依据：ISU Rule 288 para 1.e；USS 2026–27 Section J.5。
适用范围：ISU 赛事/冬奥会/青奥会“必须”；国际比赛“应当”；USS 所有运动员。

6. 冰刀
检查：刀管封闭，刀刃末端磨圆（最小半径 10mm）；刀片至少两点固定于靴，无活动部件。
官方依据：ISU Rule 288 para 1.f。
适用范围：ISU 赛事/冬奥会/青奥会“必须”；国际比赛“应当”。（USS 规则未另设冰刀条文，按 ISU Rule 288 执行。）

7. 护颈
检查：防切割护颈，完全覆盖颈部。
官方依据：ISU Rule 288 para 1.g；USS 2026–27 Section J.5。
适用范围：ISU 赛事/冬奥会/青奥会“必须”；国际比赛“应当”；USS 所有运动员。

8. 护目镜
检查：ISU 赛事/冬奥会/青奥会须佩戴符合最新相关 ISU Communication 批准标准的护目镜。USS：所有运动员须佩戴合适的护目镜（防碎安全眼镜或完整面罩，按 ISU Comm 2810）；建议使用眼镜固定带。
官方依据：ISU Rule 288 para 1.h；USS 2026–27 Section J.4。
适用范围：ISU 赛事/冬奥会/青奥会（ISU）；USS 要求更广——所有运动员（不限于选拔赛）。地方/俱乐部赛按 USS J.4 与赛事公告执行。

9. 通讯与录制设备（不得佩戴）
检查：比赛时不得佩戴用于与外界联系或接收信息的通讯设备（ISU Rule 288(6)）。USS 另明确包括智能眼镜等录制设备（USS §1.J.6）。
官方依据：ISU Rule 288 para 6（比赛中用于与外界联系或接收信息的通讯设备，违规受罚）；USS 2026–27 §1.J.6（另明确包括智能眼镜等录制设备）。
适用范围：比赛期间。ISU 与 USS 是两套规则，分开写：ISU 限制通讯设备，USS 另明确录制设备。

10. 赛前装备检查
检查：提前到热身区（Heat Box）接受装备检查；裁判员确认装备合规后方可参赛。装备不合规者不得参赛，成绩记 Did Not Start。比赛结束前不得自行摘除装备（中途摘下受罚；因摔倒等非本人可控原因丢失装备不罚）。
官方依据：ISU Rule 288 para 4（Heat Box Steward 检查，不合规者不得参赛）、para 5（比赛结束前不得自行摘除装备；中途摘下受罚；非本人可控丢失不罚）；Heat Box 到场与检查另见 ISU Rule 294(1）。
适用范围：ISU 赛事/冬奥会/青奥会。地方/俱乐部赛是否设 Heat Box 检查，按赛事公告执行。

二、场地检查

11. 赛道与冰场
检查：111.12 米椭圆形赛道，位于有顶、封闭、供暖的冰场，最小 60×30 米。
官方依据：ISU Rule 280 para 1.a。
适用范围：ISU 赛事/冬奥会/青奥会。国际比赛在宽度不足 30 米的冰场，按公告中的赛道图（Rule 280 para 3）。日常训练冰场不适用此竞赛标准，按场馆实际条件执行。

12. 防护垫
检查：冰面四周须安装防护垫；垫子须为防水面料（不一定防切割）、相互连接、靠自重立于冰面。最低级别按赛事级别：
- 冬奥会：必须用可移动式（Moveable）防护系统。
- ISU 赛事与青奥会：至少可移动式或混合式（Moveable or Hybrid）。
- 国际成年组与青少年 A/B 组：至少传统式（Traditional rink board Padding）。
- 国际青少年 C/D 组：至少基础式（Basic Padding System）。
官方依据：ISU Rule 280 para 5.a–5.h（垫子要求与三类系统定义、按级别的最低要求）。
适用范围：防护垫最低级别因赛事级别与青少年年龄组而异，须按该赛事的公告执行。地方/俱乐部赛的防护垫按赛事公告与 USS 认可执行，不直接套用 ISU 的级别表。训练冰场的防护垫按场馆与俱乐部安排。

13. 赛道标志
检查：每弯道须用 7 个 ISU 短道技术委员会批准的标志块。
官方依据：ISU Rule 280 para 4。
适用范围：ISU 赛事/冬奥会/青奥会。地方/俱乐部赛按赛事公告执行。

14. 起跑线与终点线
检查：起跑线与终点线须用彩色线标出，与直道垂直、宽不超过 2cm。
官方依据：ISU Rule 280 para 2。
适用范围：ISU 赛事/冬奥会/青奥会。地方/俱乐部赛按赛事公告执行。

15. 急救与医疗
检查：ISU 赛事须有医师和急救人员在场（ISU Rule 286(3)）。USS 选拔赛及相关赛事的医疗程序见《USS Event Hosting Manual》（USS §1.K）。急救包和就医通道向主办方或俱乐部确认。
官方依据：ISU Rule 286(3)（医师和急救人员在场）；USS 2026–27 §1.K（选拔赛及相关赛事的医疗程序指向《USS Event Hosting Manual》）。急救包与就医通道：未在上述条文中找到具体规定，向主办方或俱乐部确认，不写成规则。
适用范围：ISU 赛事（Rule 286(3)）；USS 选拔赛及相关赛事（§1.K）。急救包与就医通道按赛事公告与俱乐部安排。`;

const BODY_EN = `A short bilingual pre-ice checklist for youth short track skaters, built from the ISU 2026 Short Track Sport Rules and the US Speedskating 2026–2027 Short Track Rules & Regulations. Each item cites its official basis, scope, and verification date (2026-11-17). Items without a verifiable official basis are marked "unverified" and are not stated as rules.

1. Helmet
Check: Safety-type helmet complying with the current ASTM standard for Short Track (or another ISU-approved standard); regular shape, no protrusions; chin strap properly fastened.
Scope: Mandatory at ISU Events / Olympic / Youth Olympic Games; "should" at International Competitions; required for all skaters under USS rules.

2. Gloves / Mitts
Check: Cut-resistant gloves or mitts; predominantly white at ISU Events / Olympic / Youth Olympic Games. Under USS rules (§1.J.3): all competitors wear predominantly white Level 3 cut-resistant gloves or mitts (per ISU Communication 2810).

3. Shin Protection
Check: Wear shin protection.

4. Long-Sleeved / Long-Legged Clothing & Cut-Resistant Suit
Check: Long-sleeved and long-legged clothing (per the current ISU Communication). Under USS rules (§1.J.1), the full-body cut-resistant suit (integrated into the skinsuit or as separate underwear) is tiered by competition level: Selection competitions — Level 3 suit + Level 3 gloves mandatory; Age Group Nationals — Level 2 suit mandatory, Level 3 highly recommended; Regional/club competitions — Level 2 suit highly recommended.

5. Knee Protection
Check: Padded or padded hard-shell knee protection.

6. Skates
Check: Skate tubes closed; blade ends rounded off, minimum radius 10 mm; blades fixed to the boot at a minimum of two points, with no moveable parts.

7. Neck Protection
Check: Neck protection of cut-resistant nature, fully covering the neck.

8. Eye Protection
Check: At ISU Events / Olympic / Youth Olympic Games, wear eye wear protection meeting the approved standards in the latest relevant ISU Communication. Under USS rules, all skaters must wear appropriate protective eyewear (shatter-resistant safety glasses or a complete visor, per ISU Comm 2810); a safety strap is recommended.

9. Communication & Recording Devices
Check: While competing, do not wear communication equipment used to contact the outside world or receive information (ISU Rule 288(6)). USS rules separately explicitly include recording devices such as smart glasses (§1.J.6).

10. Heat Box Check
Check: Arrive early for the Heat Box equipment check. The Heat Box Steward confirms compliance before a skater may start; non-compliant skaters are excluded (Did Not Start). Do not remove equipment before the end of the race.

11. Track & Rink
Check: A 111.12 m oval track in a covered, enclosed and heated ice rink, minimum 60 × 30 m.

12. Protective Mats / Padding
Check: Protective mats must be installed around the ice surface; mats covered with a water-resistant material, attached to each other, standing with their weight on the ice. Minimum tier by level: Olympic Winter Games — Moveable mandatory; ISU Events / Winter Youth Olympic Games — Moveable or Hybrid minimum; International Senior and Junior A & B — Traditional minimum; International Junior C & D — Basic minimum.

13. Track Markers
Check: Seven track marking blocks of an ISU Short Track Technical Committee-approved design must be used in each curve.

14. Start / Finish Lines
Check: Starting and finish lines must be denoted by colored lines at right angles to the straight, not more than 2 cm wide.

15. First Aid / Medical
Check: ISU events must have a Medical Doctor and First Aid attendants in attendance (ISU Rule 286(3)). For USS selection and related events, medical procedures are set out in the USS Event Hosting Manual (§1.K). Confirm the first-aid kit and medical access with the organizer or club.`;

const PREICE = {
  id: "KA-PREICE-001",
  status: "draft",
  reviewStatus: "pending",
  schemaVersion: 1,
  titleZh: "青少年短道上冰前的装备与场地检查",
  titleEn: "Youth Short Track Pre-Ice Equipment and Venue Check",
  bodyZh: BODY_ZH,
  bodyEn: BODY_EN,
  category: "safety",
  tagsZh: ["装备", "场地检查", "安全"],
  tagsEn: ["Equipment", "Venue Check", "Safety"],
  sources: SOURCES,
  catalogRefs: [] as const,
  createdAt: CREATED,
  updatedAt: CREATED,
};

const OWN_IDS = [
  "KA-PREICE-001",
  "KA-PREICE-REJECT",
  "KA-PREICE-APPROVED",
  "KA-PREICE-PUBLISHED",
  "KA-PREICE-RACE",
  "KA-MISSING",
];

function openFirestore(): Firestore {
  const existing = getApps().find((app) => app.name === "catalog-p3-article-review");
  const app = existing ?? initializeApp({ projectId: PROJECT_ID }, "catalog-p3-article-review");
  return getFirestore(app);
}

async function seedArticle(db: Firestore, article: Record<string, unknown>): Promise<void> {
  await db.doc(`${ARTICLES}/${String(article.id)}`).set(article);
}

async function readArticle(db: Firestore, id: string): Promise<Record<string, unknown> | undefined> {
  return (await db.doc(`${ARTICLES}/${id}`).get()).data();
}

async function articleAudits(db: Firestore, id: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(AUDIT).where("target.id", "==", id).get();
  return snap.docs.map((item) => item.data()).filter((entry) => entry.action === "article_review");
}

async function removeOwnDocuments(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const id of OWN_IDS) batch.delete(db.doc(`${ARTICLES}/${id}`));
  const logs = await db.collection(AUDIT).where("target.id", "in", OWN_IDS).get();
  for (const item of logs.docs) batch.delete(item.ref);
  await batch.commit();
}

describe("P3 knowledge article review on the emulator", () => {
  let db: Firestore;

  beforeAll(async () => {
    expect(PROJECT_ID.startsWith("demo-")).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    db = openFirestore();
    await removeOwnDocuments(db);
    await seedArticle(db, PREICE);
  });

  afterAll(async () => {
    if (db) await removeOwnDocuments(db);
  });

  it("A approves KA-PREICE-001 and leaves the article draft", async () => {
    await reviewKnowledgeArticle(db, {
      articleId: "KA-PREICE-001",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-001`).get()).data() ?? {}),
    });

    const article = await readArticle(db, "KA-PREICE-001");
    expect(article?.status).toBe("draft");
    expect(article?.reviewStatus).toBe("approved");
    expect(article?.reviewer).toBe(REVIEWER);
    expect(typeof article?.reviewedAt).toBe("string");
    expect(Number.isNaN(Date.parse(String(article?.reviewedAt)))).toBe(false);
    expect(article?.titleZh).toBe(PREICE.titleZh);
    expect(article?.titleEn).toBe(PREICE.titleEn);
    expect(article?.bodyZh).toBe(PREICE.bodyZh);
    expect(article?.bodyEn).toBe(PREICE.bodyEn);
    expect(article?.sources).toEqual(PREICE.sources);
    expect(article?.catalogRefs).toEqual([]);
    expect(article?.category).toBe("safety");
    expect(article?.schemaVersion).toBe(1);

    const approved = (await articleAudits(db, "KA-PREICE-001")).filter((entry) => entry.result === "ok");
    expect(approved).toEqual([
      expect.objectContaining({
        action: "article_review",
        actor: REVIEWER,
        result: "ok",
        detail: "approved",
        target: { collection: "trainingCatalogKnowledgeArticles", id: "KA-PREICE-001" },
      }),
    ]);
  });

  it("B rejects a pending draft and keeps status draft", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-REJECT",
      status: "draft",
      reviewStatus: "pending",
      schemaVersion: 1,
      titleZh: "驳回样本",
      titleEn: "Reject sample",
      category: "safety",
      createdAt: CREATED,
      updatedAt: CREATED,
    });

    await reviewKnowledgeArticle(db, {
      articleId: "KA-PREICE-REJECT",
      reviewer: REVIEWER,
      decision: "rejected",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-REJECT`).get()).data() ?? {}),
    });

    const article = await readArticle(db, "KA-PREICE-REJECT");
    expect(article?.status).toBe("draft");
    expect(article?.reviewStatus).toBe("rejected");
    expect(article?.reviewer).toBe(REVIEWER);
    expect(typeof article?.reviewedAt).toBe("string");
    const rejected = (await articleAudits(db, "KA-PREICE-REJECT")).filter((entry) => entry.detail === "rejected");
    expect(rejected).toEqual([
      expect.objectContaining({
        action: "article_review",
        actor: REVIEWER,
        result: "ok",
        detail: "rejected",
      }),
    ]);
  });

  it("C refuses to review an article that is already approved", async () => {
    const seeded = {
      id: "KA-PREICE-APPROVED",
      status: "draft",
      reviewStatus: "approved",
      reviewer: "reviewer-earlier",
      reviewedAt: CREATED,
      schemaVersion: 1,
      titleZh: PREICE.titleZh,
      titleEn: PREICE.titleEn,
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    await seedArticle(db, seeded);

    await expect(reviewKnowledgeArticle(db, {
      articleId: "KA-PREICE-APPROVED",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-APPROVED`).get()).data() ?? {}),
    })).rejects.toThrow(/reviewStatus must be pending or rejected/);

    const article = await readArticle(db, "KA-PREICE-APPROVED");
    expect(article?.status).toBe("draft");
    expect(article?.reviewStatus).toBe("approved");
    expect(article?.reviewer).toBe("reviewer-earlier");
    expect(article?.reviewedAt).toBe(CREATED);
    expect(article?.titleZh).toBe(PREICE.titleZh);
    const rejected = (await articleAudits(db, "KA-PREICE-APPROVED")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      action: "article_review",
      actor: REVIEWER,
      result: "rejected",
    });
    expect(String(rejected[0]?.detail)).toMatch(/reviewStatus must be pending or rejected/);
  });

  it("D refuses to review an article that does not exist", async () => {
    await expect(reviewKnowledgeArticle(db, {
      articleId: "KA-MISSING",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash({}),
    })).rejects.toThrow(/document does not exist/);
    expect((await db.doc(`${ARTICLES}/KA-MISSING`).get()).exists).toBe(false);
    const rejected = (await articleAudits(db, "KA-MISSING")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/document does not exist/);
  });

  it("E refuses to review an article whose status is not draft", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-PUBLISHED",
      status: "published",
      reviewStatus: "pending",
      schemaVersion: 1,
      titleZh: PREICE.titleZh,
      titleEn: PREICE.titleEn,
      createdAt: CREATED,
      updatedAt: CREATED,
    });

    await expect(reviewKnowledgeArticle(db, {
      articleId: "KA-PREICE-PUBLISHED",
      reviewer: REVIEWER,
      decision: "approved",
      expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-PUBLISHED`).get()).data() ?? {}),
    })).rejects.toThrow(/status must be draft/);

    const article = await readArticle(db, "KA-PREICE-PUBLISHED");
    expect(article?.status).toBe("published");
    expect(article?.reviewStatus).toBe("pending");
    expect(article?.reviewer).toBeUndefined();
    expect(article?.reviewedAt).toBeUndefined();
    const rejected = (await articleAudits(db, "KA-PREICE-PUBLISHED")).filter((entry) => entry.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.detail)).toMatch(/status must be draft/);
  });

  it("two concurrent reviews of one draft leave a single decision", async () => {
    await seedArticle(db, {
      id: "KA-PREICE-RACE",
      status: "draft",
      reviewStatus: "pending",
      schemaVersion: 1,
      titleZh: PREICE.titleZh,
      bodyZh: "同一篇文章",
      createdAt: CREATED,
      updatedAt: CREATED,
    });

    const results = await Promise.allSettled([
      reviewKnowledgeArticle(db, {
        articleId: "KA-PREICE-RACE",
        reviewer: "reviewer-a",
        decision: "approved",
        expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-RACE`).get()).data() ?? {}),
      }),
      reviewKnowledgeArticle(db, {
        articleId: "KA-PREICE-RACE",
        reviewer: "reviewer-b",
        decision: "approved",
        expectedContentSha256: contentHash((await db.doc(`${ARTICLES}/KA-PREICE-RACE`).get()).data() ?? {}),
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const article = await readArticle(db, "KA-PREICE-RACE");
    const logs = await articleAudits(db, "KA-PREICE-RACE");
    const ok = logs.filter((entry) => entry.result === "ok");
    const rejected = logs.filter((entry) => entry.result === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(article?.status).toBe("draft");
    expect(article?.reviewStatus).toBe("approved");
    expect(article?.reviewer).toBe(ok[0]?.actor);
    expect(["reviewer-a", "reviewer-b"]).toContain(article?.reviewer);
    expect(typeof article?.reviewedContentSha256).toBe("string");
  });
});
