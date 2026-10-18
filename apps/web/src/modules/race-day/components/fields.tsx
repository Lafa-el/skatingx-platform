import { ErrorNotice, Notice, StatusGlyph } from "@skatingx/ui";
import { useId, type ReactNode } from "react";

// Border at navy/50 keeps the edge of a field at 3:1 or more against white (a form control needs it);
// the invalid state changes the border to the error red and the message below it has an icon.
const INPUT_CLASS =
  "mt-1 block min-h-11 w-full rounded-control border border-brand-navy/50 bg-white px-3 py-2 text-base text-brand-navy shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy disabled:bg-brand-ice disabled:text-brand-navy/70 aria-[invalid=true]:border-status-danger";

/** The card surface Race Day lists and panels share. */
export const SURFACE_CARD = "rounded-card border border-brand-navy/10 bg-white p-4 shadow-card";

const LABEL_CLASS = "block text-sm font-medium text-brand-navy";

/** A field's error: the icon and the words together, never colour alone. */
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-status-danger">
      <StatusGlyph tone="danger" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
};

export function SelectField({ label, value, options, onChange, disabled = false, error = null }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={INPUT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Marks the input invalid when the message is shown elsewhere (e.g. one error for a group). */
  invalid?: boolean;
  hint?: string;
  type?: "text" | "date" | "time";
  required?: boolean;
  disabled?: boolean;
  list?: string;
  inputMode?: "text" | "numeric";
};

/** Label, hint and error are wired to the input (`for`, `aria-describedby`, `aria-invalid`). */
export function TextField({
  label,
  value,
  onChange,
  error = null,
  invalid = false,
  hint,
  type = "text",
  required = false,
  disabled = false,
  list,
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        list={list}
        inputMode={inputMode}
        autoComplete="off"
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={INPUT_CLASS}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-brand-navy/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : null}
    </div>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  rows?: number;
};

/** Same wiring as `TextField` for text that runs over several lines. */
export function TextAreaField({
  label,
  value,
  onChange,
  error = null,
  hint,
  disabled = false,
  rows = 5,
}: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={INPUT_CLASS}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-brand-navy/70">
          {hint}
        </p>
      ) : null}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : null}
    </div>
  );
}

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function CheckboxField({ label, checked, onChange, disabled = false }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="h-6 w-6 rounded border-brand-navy/50 accent-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
      />
      <label htmlFor={id} className="min-w-0 break-words text-sm text-brand-navy">
        {label}
      </label>
    </div>
  );
}

export function FormMessage({ children, tone }: { children: ReactNode; tone: "error" | "info" }) {
  return tone === "error" ? <ErrorNotice>{children}</ErrorNotice> : <Notice tone="info" role="status">{children}</Notice>;
}

// The three button looks match `Button` brand / outline / danger-outline in @skatingx/ui. They stay class
// strings because Race Day puts them on links as well as buttons.
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-control px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
// Navy text on flame, never white: white on flame is 3.51:1, navy is 4.88:1.
export const PRIMARY_BUTTON = `${BUTTON_BASE} bg-brand-flame text-brand-navy hover:bg-brand-flame-hover focus-visible:outline-brand-navy disabled:hover:bg-brand-flame`;
export const SECONDARY_BUTTON = `${BUTTON_BASE} border border-brand-navy/50 bg-transparent text-brand-navy hover:bg-brand-ice focus-visible:outline-brand-navy disabled:hover:bg-transparent`;
export const DANGER_BUTTON = `${BUTTON_BASE} border border-status-danger/60 bg-transparent text-status-danger hover:bg-status-danger-tint focus-visible:outline-status-danger disabled:hover:bg-transparent`;
