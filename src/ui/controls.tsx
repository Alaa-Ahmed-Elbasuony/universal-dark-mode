import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible label text; also the accessible name. */
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
}

/** A labelled on/off switch (button with role="switch"). */
export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  const labelId = `${id ?? label.replace(/\W+/g, '-')}-label`;
  return (
    <div className="row">
      <div>
        <strong id={labelId}>{label}</strong>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        className="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

interface RangeProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}

export function Range({ id, label, value, min, max, step = 1, onChange, format, disabled }: RangeProps) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span>{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface SelectProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
}

export function Select<T extends string>({ id, label, value, options, onChange, hint }: SelectProps<T>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
