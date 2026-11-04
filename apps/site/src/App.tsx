import { Card } from "@skatingx/ui";
import { useEffect, useState, type ReactNode } from "react";

import { readSiteLocale, storeSiteLocale } from "@/i18n/locale";
import { siteMessage, type SiteLocale, type SiteMessageKey } from "@/i18n/messages";

const APP_URL = "https://app.skatingx.com";

const CTA =
  "inline-flex min-h-11 items-center justify-center rounded-control bg-brand-flame px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-flame-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

const NAV = [
  ["hero", "site.nav.hero"],
  ["training", "site.nav.training"],
  ["analysis", "site.nav.analysis"],
  ["race-day", "site.nav.race"],
  ["pro", "site.nav.pro"],
  ["privacy", "site.nav.privacy"],
] as const satisfies ReadonlyArray<readonly [string, SiteMessageKey]>;

export function App() {
  const [locale, setLocale] = useState<SiteLocale>(readSiteLocale);
  const t = (key: SiteMessageKey) => siteMessage(locale, key);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = siteMessage(locale, "site.meta.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", siteMessage(locale, "site.meta.description"));
    storeSiteLocale(locale);
  }, [locale]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-brand-navy text-brand-ice">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <a
            href="#hero"
            className="text-lg font-bold text-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ice"
          >
            {t("site.brand")}
          </a>
          <nav aria-label={t("site.nav.label")} className="flex flex-wrap gap-1">
            {NAV.map(([id, key]) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex min-h-11 items-center rounded-control px-2 text-sm text-brand-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ice"
              >
                {t(key)}
              </a>
            ))}
          </nav>
          <div role="group" aria-label={t("site.lang.label")} className="flex gap-2">
            <LangButton
              pressed={locale === "zh"}
              onClick={() => setLocale("zh")}
            >
              {t("site.lang.zh")}
            </LangButton>
            <LangButton
              pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {t("site.lang.en")}
            </LangButton>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="scroll-mt-24 bg-brand-navy text-brand-ice">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
            <p className="text-sm font-semibold tracking-wide text-brand-ice">{t("site.hero.kicker")}</p>
            <div className="mt-4 h-2 w-24 rounded-full sx-energy-gradient" aria-hidden="true" />
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">{t("site.hero.title")}</h1>
            <p className="mt-4 max-w-2xl text-lg text-brand-ice">{t("site.hero.body")}</p>
            <a className={`${CTA} mt-8`} href={APP_URL}>
              {t("site.hero.cta")}
            </a>
          </div>
        </section>

        <Section id="training" title={t("site.training.title")} lead={t("site.training.lead")}>
          <CardGrid>
            <Card title={t("site.training.tasks.title")}>{t("site.training.tasks.body")}</Card>
            <Card title={t("site.training.plans.title")}>{t("site.training.plans.body")}</Card>
            <Card title={t("site.training.points.title")}>{t("site.training.points.body")}</Card>
          </CardGrid>
        </Section>

        <Section id="analysis" title={t("site.analysis.title")} lead={t("site.analysis.lead")}>
          <CardGrid>
            <Card title={t("site.analysis.pacing.title")}>{t("site.analysis.pacing.body")}</Card>
            <Card title={t("site.analysis.fitness.title")}>{t("site.analysis.fitness.body")}</Card>
            <Card title={t("site.analysis.equipment.title")}>{t("site.analysis.equipment.body")}</Card>
          </CardGrid>
        </Section>

        <Section id="race-day" title={t("site.race.title")} lead={t("site.race.lead")}>
          <CardGrid>
            <Card title={t("site.race.schedule.title")}>{t("site.race.schedule.body")}</Card>
            <Card title={t("site.race.results.title")}>{t("site.race.results.body")}</Card>
            <Card title={t("site.race.videos.title")}>{t("site.race.videos.body")}</Card>
          </CardGrid>
        </Section>

        <Section id="pro" title={t("site.pro.title")} lead={t("site.pro.lead")}>
          <article className="max-w-xl rounded-card border border-brand-navy/10 bg-white p-4 shadow-card">
            <p className="sx-numeric text-5xl text-brand-navy">{t("site.pro.price")}</p>
            <p className="mt-1 text-sm text-brand-navy/80">{t("site.pro.period")}</p>
            <h3 className="mt-4 text-sm font-semibold text-brand-navy">{t("site.pro.includes")}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-navy/80">
              <li>{t("site.pro.benefit.videos")}</li>
              <li>{t("site.pro.benefit.analysis")}</li>
            </ul>
            <p className="mt-4 text-sm text-brand-navy/80">{t("site.pro.manual")}</p>
            <a className={`${CTA} mt-4`} href={APP_URL}>
              {t("site.pro.cta")}
            </a>
          </article>
        </Section>

        <Section id="privacy" title={t("site.privacy.title")} lead={t("site.privacy.body")} />
      </main>

      <footer className="bg-brand-navy text-brand-ice">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">{t("site.brand")}</p>
            <p className="mt-1 text-sm text-brand-ice">{t("site.footer.note")}</p>
          </div>
          <a className={CTA} href={APP_URL}>
            {t("site.hero.cta")}
          </a>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-bold text-brand-navy">{title}</h2>
        <p className="mt-3 max-w-2xl text-base text-brand-navy/80">{lead}</p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-3">{children}</div>;
}

function LangButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ice ${
        pressed ? "bg-brand-flame text-brand-navy" : "border border-brand-ice/40 text-brand-ice"
      }`}
    >
      {children}
    </button>
  );
}
