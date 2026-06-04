type PagePlaceholderProps = {
  title: string;
  description?: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {description ? (
        <p className="mt-2 text-slate-600">{description}</p>
      ) : (
        <p className="mt-2 text-slate-600">
          Placeholder page — legacy logic will be migrated in a later phase.
        </p>
      )}
    </section>
  );
}
