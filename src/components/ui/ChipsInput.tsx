import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/** Everything that separates one pasted id from the next. */
const SEPARATORS = /[\s,;]+/;

/**
 * A list of short values typed one at a time: organization ids, for now.
 *
 * The field it replaces was a single line of comma-separated text, so «did I
 * paste two ids or one id with a space in it» was answered by the server, a
 * click later. Here each value becomes a chip the moment it is entered, and
 * what is in the list is countable at a glance.
 */
export default function ChipsInput({
  id,
  value,
  onChange,
  placeholder,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}) {
  const { translate: t } = useTranslation();
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const added = text
      .split(SEPARATORS)
      .map((token) => token.trim())
      .filter((token) => token && !value.includes(token));

    if (added.length) onChange([...value, ...added]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (!draft.trim()) return;
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="border-input bg-card focus-within:border-ring flex min-h-[48px] flex-wrap items-center gap-[8px] rounded-[12px] border px-[10px] py-[8px] transition-colors">
      {value.map((chip) => (
        <span
          key={chip}
          className="bg-primary-veil text-primary flex items-center gap-[8px] rounded-full py-[6px] pr-[6px] pl-[12px] font-mono text-[13px]"
        >
          {chip}
          <button
            type="button"
            aria-label={`${t("Quitar")} ${chip}`}
            onClick={() => onChange(value.filter((one) => one !== chip))}
            className="hover:bg-primary/15 flex h-[22px] w-[22px] items-center justify-center rounded-full"
          >
            <X className="h-[14px] w-[14px]" aria-hidden />
          </button>
        </span>
      ))}

      <input
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => {
          // A paste of «a, b, c» lands here whole: split it now, keep the
          // tail as what is still being typed.
          if (SEPARATORS.test(event.target.value)) commit(event.target.value);
          else setDraft(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        className="text-foreground placeholder:text-muted-foreground min-w-[160px] grow bg-transparent text-[15px] outline-none"
      />
    </div>
  );
}
