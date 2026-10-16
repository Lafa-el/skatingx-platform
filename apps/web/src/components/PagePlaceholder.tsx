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
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{note}</p>
    </section>
  );
}
