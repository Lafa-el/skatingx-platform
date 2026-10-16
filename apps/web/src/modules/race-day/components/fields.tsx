import { useId, type ReactNode } from "react";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 aria-[invalid=true]:border-red-500";

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
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
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
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
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
        <p id={hintId} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
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
        <p id={hintId} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
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
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="h-5 w-5 rounded border-slate-300 text-sky-700 focus:ring-sky-300"
      />
      <label htmlFor={id} className="text-sm text-slate-800">
        {label}
      </label>
    </div>
  );
}

export function FormMessage({ children, tone }: { children: ReactNode; tone: "error" | "info" }) {
  const style =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </p>
  );
}

export const PRIMARY_BUTTON =
  "rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60";
export const SECONDARY_BUTTON =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60";
export const DANGER_BUTTON =
  "rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60";
