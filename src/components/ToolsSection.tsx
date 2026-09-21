import { useState } from "react";
import {
  Calendar,
  Database,
  FileSpreadsheet,
  Globe,
  MessageSquare,
  Plus,
  Server,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type Control,
  useFieldArray,
  type FieldValues,
  type UseFormRegister,
  useWatch,
  type UseFormSetValue,
} from "react-hook-form";
import SectionItem from "@/components/SectionItem";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SwitchRow from "@/components/ui/SwitchRow";
import DrillPanel from "@/components/ui/DrillPanel";
import DrillRow, { RowPreview } from "@/components/ui/DrillRow";
import { fill } from "@/i18n/translations";
import type {
  ToolConfig,
  LocalMCPToolConfig,
  LocalHTTPToolConfig,
  LocalSQLToolConfig,
  LocalFunctionToolConfig,
} from "@/supabase/client";
import type { ToolsForm } from "./tools/types";
import MCPClientEditor from "./tools/MCPClientEditor";
import HTTPClientEditor from "./tools/HTTPClientEditor";
import SQLClientEditor from "./tools/SQLClientEditor";
import GoogleMCPClientEditor from "./tools/GoogleMCPClientEditor";
import OpenBSPMCPClientEditor from "./tools/OpenBSPMCPClientEditor";
import NewToolSelection from "./tools/NewToolSelection";

export type { ToolsForm };

type ToolsSectionProps = {
  control: Control<ToolsForm>;
  register: UseFormRegister<ToolsForm>;
  setValue: UseFormSetValue<ToolsForm>;
};

type EditorState =
  | { type: "closed" }
  | { type: "new-selection" }
  | { type: "mcp"; index: number }
  | { type: "google-mcp"; index: number }
  | { type: "openbsp-mcp"; index: number }
  | { type: "http"; index: number }
  | { type: "sql"; index: number };

/**
 * What to call a tool when there is room for two words and not for a URL.
 *
 * The list inside the panel shows the URL, which is what you need while you
 * are wiring one up. The row outside it shows this, which is what you need
 * when you are looking at an agent and asking what it can do.
 */
function toolName(tool: ToolConfig, t: (text: string) => string): string {
  if ("label" in tool && tool.label) return tool.label;

  if (tool.type === "mcp") {
    if (tool.config.product === "calendar") return t("Agenda");
    if (tool.config.product === "sheets") return t("Planilla");
    if (tool.config.product === "openbsp") return "WhatsApp";
    return t("Cliente MCP");
  }

  if (tool.type === "http") return t("Cliente HTTP");
  if (tool.type === "sql") return t("Base de datos");

  return t("Calculadora");
}

export default function ToolsSection<T extends FieldValues & ToolsForm>(props: {
  control: Control<T>;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  /** The name of the agent these tools belong to. */
  owner?: string;
  disabled?: boolean;
  disabledReason?: string;
  plain?: boolean;
  last?: boolean;
}) {
  const { owner, disabled, disabledReason, plain, last } = props;
  // RHF's handles are invariant in the form type, so a `Control<AIAgentUpdate>`
  // is not a `Control<ToolsForm>` even though the shapes agree. The constraint
  // above is what checks the caller; this is the only cast in the file.
  const { control, register, setValue } = props as unknown as ToolsSectionProps;

  const { translate: t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ type: "closed" });

  // useFieldArray for structure (IDs) and operations (append/remove)
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "extra.tools",
  });

  // useWatch for current values (fields has stale data after edits via register)
  const toolsValues = useWatch({ control, name: "extra.tools" }) || [];

  // Combine fields (for IDs) with watched values (for current data)
  const allTools = fields.map((field, index) => ({
    ...(toolsValues[index] || field),
    id: field.id,
    _index: index,
  }));

  const mcpClients = allTools.filter((tool) => tool.type === "mcp");

  const googleTools = mcpClients.filter((tool) =>
    ["calendar", "sheets"].includes(tool.config.product ?? ""),
  );

  const openbspTools = mcpClients.filter(
    (tool) => tool.config.product === "openbsp",
  );

  // Anything not claimed above (including an unset product) is a plain client.
  const mcpTools = mcpClients.filter(
    (tool) =>
      !["calendar", "sheets", "openbsp"].includes(tool.config.product ?? ""),
  );

  const httpTools = allTools.filter((tool) => tool.type === "http");

  const sqlTools = allTools.filter((tool) => tool.type === "sql");

  // Simple tools (function type) - only one instance of each allowed
  type SimpleToolName = "calculator";

  const hasSimpleTool = (name: SimpleToolName): boolean => {
    return toolsValues.some(
      (tool) => tool.type === "function" && tool.name === name,
    );
  };

  const toggleSimpleTool = (name: SimpleToolName) => {
    if (hasSimpleTool(name)) {
      // Remove the tool
      const index = toolsValues.findIndex(
        (tool) => tool.type === "function" && tool.name === name,
      );
      if (index !== -1) {
        remove(index);
      }
    } else {
      // Add the tool
      const newTool: LocalFunctionToolConfig = {
        provider: "local",
        type: "function",
        name,
      };
      append(newTool);
    }
  };

  const handleAddMCP = () => {
    const newTool: LocalMCPToolConfig = {
      provider: "local",
      type: "mcp",
      label: "",
      config: { url: "" },
    };
    append(newTool);
    setEditor({ type: "mcp", index: fields.length });
  };

  const handleAddHTTP = () => {
    const newTool: LocalHTTPToolConfig = {
      provider: "local",
      type: "http",
      label: "",
      config: {
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      },
    };
    append(newTool);
    setEditor({ type: "http", index: fields.length });
  };

  const handleAddSQL = () => {
    const newTool: LocalSQLToolConfig = {
      provider: "local",
      type: "sql",
      label: "",
      config: { driver: "libsql", url: "" },
    };
    append(newTool);
    setEditor({ type: "sql", index: fields.length });
  };

  const handleAddGoogle = (product: "calendar" | "sheets") => {
    const defaultTools =
      product === "calendar"
        ? [
            "list_calendars",
            "list_events",
            "check_availability",
            "create_event",
            "update_event",
            "delete_event",
          ]
        : [
            "list_authorized_files",
            "get_spreadsheet",
            "get_sheet_schema",
            "describe_sheet",
            "search_rows",
            "read_sheet",
            "write_sheet",
            "append_rows",
            "create_spreadsheet",
            "semantic_search",
          ];

    const newTool: LocalMCPToolConfig = {
      provider: "local",
      type: "mcp",
      label: "",
      config: {
        url: "https://g.mcp.openbsp.dev/mcp",
        product,
        allowed_tools: defaultTools,
      },
    };
    append(newTool);
    setEditor({ type: "google-mcp", index: fields.length });
  };

  const handleAddOpenBSP = () => {
    const defaultTools = [
      "list_conversations",
      "fetch_conversation",
      "search_contacts",
      "list_accounts",
      "send_message",
      "list_templates",
      "fetch_template",
    ];
    const newTool: LocalMCPToolConfig = {
      provider: "local",
      type: "mcp",
      label: "",
      config: {
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`,
        product: "openbsp",
        allowed_tools: defaultTools,
      },
    };
    append(newTool);
    setEditor({ type: "openbsp-mcp", index: fields.length });
  };

  const handleDeleteTool = (index: number) => {
    remove(index);
  };

  const handleBack = () => {
    setIsOpen(false);
    setEditor({ type: "closed" });
  };

  const isEditing = editor.type !== "closed";

  return (
    <>
      <DrillRow
        label={t("Herramientas")}
        plain={plain}
        last={last}
        disabled={disabled}
        disabledReason={disabledReason}
        onClick={() => setIsOpen(true)}
      >
        {allTools.length === 0 ? (
          <RowPreview>{t("Ninguna: el agente solo conversa")}</RowPreview>
        ) : (
          <span className="flex flex-wrap items-center gap-[6px]">
            {allTools.slice(0, 3).map((tool) => (
              <Badge key={tool.id}>{toolName(tool, t)}</Badge>
            ))}
            {allTools.length > 3 && (
              <span className="text-muted-foreground text-[12px]">
                {fill(t("+{n} más"), { n: allTools.length - 3 })}
              </span>
            )}
          </span>
        )}
      </DrillRow>

      {/* Tools List Modal */}
      {isOpen && !isEditing && (
        <DrillPanel
          title={t("Herramientas")}
          subtitle={owner}
          onBack={handleBack}
          className="gap-[4px] p-[10px]"
          footer={
            <button type="button" className="primary" onClick={handleBack}>
              {t("Listo")}
            </button>
          }
        >
          {/* Add button */}
          <SectionItem
            title={t("Agregar herramienta")}
            aside={
              <div className="p-[8px] bg-primary/10 rounded-full">
                <Plus className="w-[24px] h-[24px] text-primary" />
              </div>
            }
            onClick={() => setEditor({ type: "new-selection" })}
          />

          {allTools.length === 0 && (
            <p className="text-secondary-foreground px-[10px] py-[10px] text-[14px] leading-[1.5]">
              {t(
                "Sin herramientas el agente solo conversa: no mira stock, no anota en la planilla, no agenda un retiro.",
              )}
            </p>
          )}

          {/* Google Tools */}
          {googleTools.map((tool) => (
            <SectionItem
              key={tool.id}
              title={tool.label || t("Sin nombre")}
              description={tool.config.url || t("Sin URL")}
              aside={
                <div className="p-[8px] bg-muted rounded-full">
                  {tool.config.product === "calendar" ? (
                    <Calendar className="w-[24px] h-[24px] text-muted-foreground" />
                  ) : (
                    <FileSpreadsheet className="w-[24px] h-[24px] text-muted-foreground" />
                  )}
                </div>
              }
              onClick={() =>
                setEditor({ type: "google-mcp", index: tool._index })
              }
            />
          ))}

          {/* OpenBSP Tools */}
          {openbspTools.map((tool) => (
            <SectionItem
              key={tool.id}
              title={tool.label || t("Sin nombre")}
              description={tool.config.url || t("Sin URL")}
              aside={
                <div className="p-[8px] bg-muted rounded-full">
                  <MessageSquare className="w-[24px] h-[24px] text-muted-foreground" />
                </div>
              }
              onClick={() =>
                setEditor({ type: "openbsp-mcp", index: tool._index })
              }
            />
          ))}

          {/* Existing MCP Clients */}
          {mcpTools.map((tool) => (
            <SectionItem
              key={tool.id}
              title={tool.label || t("Sin nombre")}
              description={tool.config.url || t("Sin URL")}
              aside={
                <div className="p-[8px] bg-muted rounded-full">
                  <Server className="w-[24px] h-[24px] text-muted-foreground" />
                </div>
              }
              onClick={() => setEditor({ type: "mcp", index: tool._index })}
            />
          ))}

          {/* Existing HTTP Clients */}
          {httpTools.map((tool) => (
            <SectionItem
              key={tool.id}
              title={tool.label || t("Sin nombre")}
              description={tool.config.url || t("Sin URL base")}
              aside={
                <div className="p-[8px] bg-muted rounded-full">
                  <Globe className="w-[24px] h-[24px] text-muted-foreground" />
                </div>
              }
              onClick={() => setEditor({ type: "http", index: tool._index })}
            />
          ))}

          {/* Existing SQL Clients */}
          {sqlTools.map((tool) => {
            // Format: driver://host/db
            const { config } = tool;
            const desc =
              "url" in config
                ? `libsql://${config.url.replace(/^.*:\/\//, "")}`
                : `${config.driver}://${config.host || "localhost"}/${config.database || ""}`;

            return (
              <SectionItem
                key={tool.id}
                title={tool.label || t("Sin nombre")}
                description={desc}
                aside={
                  <div className="p-[8px] bg-muted rounded-full">
                    <Database className="w-[24px] h-[24px] text-muted-foreground" />
                  </div>
                }
                onClick={() => setEditor({ type: "sql", index: tool._index })}
              />
            );
          })}

          <Card title={t("Incluidas")} padded={false} className="mt-[10px]">
            <p className="text-muted-foreground px-[20px] pb-[12px] text-[13px] leading-[1.5]">
              {t("No hay nada que configurar: se prenden y listo.")}
            </p>
            <SwitchRow
              label={t("Calculadora")}
              description={t(
                "Para que no se equivoque sumando el total de un pedido.",
              )}
              checked={hasSimpleTool("calculator")}
              onCheckedChange={() => toggleSimpleTool("calculator")}
              last
            />
          </Card>
        </DrillPanel>
      )}

      {/* New Tool Selection */}
      {isOpen && editor.type === "new-selection" && (
        <NewToolSelection
          onBack={() => setEditor({ type: "closed" })}
          onAddMCP={handleAddMCP}
          onAddHTTP={handleAddHTTP}
          onAddSQL={handleAddSQL}
          onAddGoogle={handleAddGoogle}
          onAddOpenBSP={handleAddOpenBSP}
        />
      )}

      {/* Google MCP Client Editor */}
      {isOpen && editor.type === "google-mcp" && (
        <GoogleMCPClientEditor
          index={editor.index}
          register={register}
          control={control}
          setValue={setValue}
          updateTool={(idx, data) => update(idx, data)}
          onDelete={() => {
            handleDeleteTool(editor.index);
            setEditor({ type: "closed" });
          }}
          onBack={() => setEditor({ type: "closed" })}
        />
      )}

      {/* OpenBSP MCP Client Editor */}
      {isOpen && editor.type === "openbsp-mcp" && (
        <OpenBSPMCPClientEditor
          index={editor.index}
          register={register}
          control={control}
          setValue={setValue}
          onDelete={() => {
            handleDeleteTool(editor.index);
            setEditor({ type: "closed" });
          }}
          onBack={() => setEditor({ type: "closed" })}
        />
      )}

      {/* MCP Client Editor */}
      {isOpen && editor.type === "mcp" && (
        <MCPClientEditor
          index={editor.index}
          register={register}
          control={control}
          onDelete={() => {
            handleDeleteTool(editor.index);
            setEditor({ type: "closed" });
          }}
          onBack={() => setEditor({ type: "closed" })}
        />
      )}

      {/* HTTP Client Editor */}
      {isOpen && editor.type === "http" && (
        <HTTPClientEditor
          index={editor.index}
          register={register}
          control={control}
          onDelete={() => {
            handleDeleteTool(editor.index);
            setEditor({ type: "closed" });
          }}
          onBack={() => setEditor({ type: "closed" })}
        />
      )}

      {/* SQL Client Editor */}
      {isOpen && editor.type === "sql" && (
        <SQLClientEditor
          index={editor.index}
          register={register}
          control={control}
          setValue={setValue}
          onDelete={() => {
            handleDeleteTool(editor.index);
            setEditor({ type: "closed" });
          }}
          onBack={() => setEditor({ type: "closed" })}
        />
      )}
    </>
  );
}
