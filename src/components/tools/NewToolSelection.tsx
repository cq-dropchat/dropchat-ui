import DrillPanel from "@/components/ui/DrillPanel";
import {
  Calendar,
  Database,
  FileSpreadsheet,
  Globe,
  MessageSquare,
  Server,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import SectionItem from "@/components/SectionItem";

// New Tool Selection View
export default function NewToolSelection({
  onBack,
  onAddMCP,
  onAddHTTP,
  onAddSQL,
  onAddGoogle,
  onAddOpenBSP,
}: {
  onBack: () => void;
  onAddMCP: () => void;
  onAddHTTP: () => void;
  onAddSQL: () => void;
  onAddGoogle: (product: "calendar" | "sheets") => void;
  onAddOpenBSP: () => void;
}) {
  const { translate: t } = useTranslation();

  return (
    <DrillPanel
      title={t("Agregar herramienta")}
      onBack={onBack}
      className="gap-[4px] p-[10px]"
    >
      <SectionItem
        title="WhatsApp"
        description={t("Gestionar conversaciones de WhatsApp")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <MessageSquare className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={onAddOpenBSP}
      />
      <SectionItem
        title={t("Cliente MCP")}
        description={t("Conectar servidor MCP externo")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <Server className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={onAddMCP}
      />
      <SectionItem
        title={t("Cliente HTTP")}
        description={t("Realizar peticiones HTTP")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <Globe className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={onAddHTTP}
      />
      <SectionItem
        title={t("Cliente SQL")}
        description={t("Consultar base de datos")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <Database className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={onAddSQL}
      />
      <SectionItem
        title={t("Google Calendar")}
        description={t("Gestionar eventos y calendarios")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <Calendar className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={() => onAddGoogle("calendar")}
      />
      <SectionItem
        title={t("Google Sheets")}
        description={t("Leer y escribir hojas de cálculo")}
        aside={
          <div className="p-[8px] bg-muted rounded-full">
            <FileSpreadsheet className="w-[24px] h-[24px] text-muted-foreground" />
          </div>
        }
        onClick={() => onAddGoogle("sheets")}
      />
    </DrillPanel>
  );
}
