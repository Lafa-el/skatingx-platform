import { Notice } from "@skatingx/ui";

import { useLocale } from "@/hooks/useLocale";
import { tShell } from "@/shared/i18n/shell-messages";

type PagePlaceholderProps = {
  title: string;
  description?: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  const locale = useLocale();
  // An empty description counts as none, as before this text moved into the resources.
  const note = description !== undefined && description !== "" ? description : tShell(locale, "shell.placeholder.default");

  return (
    <section>
      <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
      {/* Neutral tone: the note says the page is not built yet or what it will hold, not that something is wrong. */}
      <Notice tone="info" className="mt-3">
        {note}
      </Notice>
    </section>
  );
}
