import TemplateVarInput from "./TemplateVarInput";
import type { TemplatePart } from "./template";

/** The template's text with an inline input for each variable. */
export default function TemplateComposer({
  parts,
  headExamples,
  bodyExamples,
  headVarValues,
  bodyVarValues,
  updateVarValues,
  allVarsFilled,
  onSend,
}: {
  parts: TemplatePart[];
  headExamples: string[];
  bodyExamples: string[];
  headVarValues: string[];
  bodyVarValues: string[];
  updateVarValues: (bodyVars: string[], headVars: string[]) => void;
  allVarsFilled: boolean;
  onSend: () => void;
}) {
  return (
    <div className="mx-[5px] py-[10px] min-h-[40px] max-h-40 overflow-y-auto text-[15px] leading-[20px] break-words">
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <TemplateVarInput
            key={i}
            placeholder={
              part.isHeader
                ? headExamples[part.varIndex] || `{{${part.varIndex + 1}}}`
                : bodyExamples[part.varIndex] || `{{${part.varIndex + 1}}}`
            }
            value={
              part.isHeader
                ? headVarValues[part.varIndex] || ""
                : bodyVarValues[part.varIndex] || ""
            }
            onChange={(value) => {
              if (part.isHeader) {
                const next = [...headVarValues];
                next[part.varIndex] = value;
                updateVarValues(bodyVarValues, next);
              } else {
                const next = [...bodyVarValues];
                next[part.varIndex] = value;
                updateVarValues(next, headVarValues);
              }
            }}
            onEnter={() => {
              if (
                allVarsFilled &&
                window.matchMedia("(min-width: 768px)").matches
              ) {
                onSend();
              }
            }}
            autoFocus={i === parts.findIndex((p) => typeof p !== "string")}
          />
        ),
      )}
    </div>
  );
}
