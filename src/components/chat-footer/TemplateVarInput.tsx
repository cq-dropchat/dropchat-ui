import { useEffect, useRef, useState } from "react";

/** An inline input for one template variable, as wide as its content. */
export default function TemplateVarInput({
  placeholder,
  value,
  onChange,
  onEnter,
  autoFocus,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  autoFocus?: boolean;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>();

  useEffect(() => {
    if (measureRef.current) {
      setWidth(measureRef.current.offsetWidth);
    }
  }, [value, placeholder]);

  return (
    <>
      <span
        ref={measureRef}
        className="absolute invisible whitespace-pre text-[14px] px-[12px]"
        aria-hidden
      >
        {value || placeholder}
      </span>
      <input
        type="text"
        className="inline-block bg-primary/10 border border-primary/30 rounded-full px-[12px] py-[1px] mx-[2px] text-[14px] leading-[18px] outline-none focus:border-primary"
        style={{ width: width ? `${width + 4}px` : undefined }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        autoFocus={autoFocus}
      />
    </>
  );
}
