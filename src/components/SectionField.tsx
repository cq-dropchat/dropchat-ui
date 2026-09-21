import { useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import DrillPanel from "@/components/ui/DrillPanel";
import DrillRow, { RowPreview } from "@/components/ui/DrillRow";

interface SectionFieldProps {
  label: string;
  description?: string;
  /** The name of the thing being edited, carried into the sub-panel. */
  owner?: string;
  children: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  plain?: boolean;
  last?: boolean;
}

/** A group of fields that lives behind a door of its own. */
export default function SectionField({
  label,
  description,
  owner,
  children,
  disabled,
  disabledReason,
  plain,
  last,
}: SectionFieldProps) {
  const { translate: t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <DrillRow
        label={label}
        plain={plain}
        last={last}
        disabled={disabled}
        disabledReason={disabledReason}
        onClick={() => setIsOpen(true)}
      >
        {description && <RowPreview>{description}</RowPreview>}
      </DrillRow>

      {isOpen && (
        <DrillPanel
          title={label}
          subtitle={owner}
          onBack={() => setIsOpen(false)}
          className="gap-[20px] p-[14px_12px]"
          footer={
            <button
              type="button"
              className="primary"
              onClick={() => setIsOpen(false)}
            >
              {t("Listo")}
            </button>
          }
        >
          {children}
        </DrillPanel>
      )}
    </>
  );
}
