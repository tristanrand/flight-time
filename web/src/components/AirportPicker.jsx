import { useEffect, useId, useMemo, useRef, useState } from "react";
import { airport, searchAirports } from "../data/airports.js";

/**
 * Airport field that accepts a code ("DFW") or a city ("dallas") and suggests matches.
 * `value` and `onChange` deal in IATA codes.
 */
export default function AirportPicker({ label, value, onChange, placeholder = "City or code", required, autoFocus, className = "" }) {
  const id = useId();
  const known = airport(value);
  const [text, setText] = useState(known ? `${known.city} (${known.code})` : value ?? "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  // follow changes made from outside (swap button, picking a destination), not our own typing
  const emitted = useRef(value);
  const emit = (code) => {
    emitted.current = code;
    onChange(code);
  };
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const a = airport(value);
    setText(a ? `${a.city} (${a.code})` : value ?? "");
  }, [value]);
  const matches = useMemo(() => (open ? searchAirports(text.replace(/\s*\([A-Z]{3}\)\s*$/, "")) : []), [text, open]);

  const choose = (a) => {
    setText(`${a.city} (${a.code})`);
    emit(a.code);
    setOpen(false);
  };

  const commitTyped = () => {
    const m = text.trim().toUpperCase().match(/^([A-Z]{3})$|\(([A-Z]{3})\)$/);
    const code = m?.[1] ?? m?.[2];
    if (code) {
      const a = airport(code);
      if (a) setText(`${a.city} (${a.code})`);
      emit(code);
    } else if (matches[0] && text.trim()) choose(matches[0]);
  };

  return (
    <label className={`field airport-field ${className}`}>
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          const code = e.target.value.trim().toUpperCase();
          if (/^[A-Z]{3}$/.test(code)) emit(code);
          else if (!e.target.value.trim()) emit("");
        }}
        onBlur={() => setTimeout(() => (setOpen(false), commitTyped()), 120)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(h + 1, matches.length - 1)));
          if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
          if (e.key === "Enter" && open) (e.preventDefault(), choose(matches[hi]));
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="suggest" id={`${id}-list`} role="listbox">
          {matches.map((a, i) => (
            <li
              key={a.code}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => (e.preventDefault(), choose(a))}
              onMouseEnter={() => setHi(i)}
            >
              <b>{a.code}</b>
              <span>
                {a.city}
                <small>{a.name}{a.country !== "US" ? ` · ${a.country}` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
