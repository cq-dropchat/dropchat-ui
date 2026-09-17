import { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
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
import SectionBody from "@/components/SectionBody";
import SectionItem from "@/components/SectionItem";
import Switch from "@/components/Switch";
import type {
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

export default function ToolsSection<T extends FieldValues & ToolsForm>(props: {
  control: Control<T>;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
}) {
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
      {/* Trigger - navigation style */}
      <button
        type="button"
        className="text w-full flex justify-between items-center text-left"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex flex-col gap-[2px]">
          <span className="text-foreground">{t("Herramientas")}</span>
          <span className="text-muted-foreground text-[14px]">
            {allTools.length > 0
              ? `${allTools.length} ${allTools.length === 1 ? t("herramienta") : t("herramientas")}`
              : t("Ninguna")}
          </span>
        </div>
        <ChevronRight className="w-[20px] h-[20px] text-muted-foreground shrink-0" />
      </button>

      {/* Tools List Modal */}
      {isOpen && !isEditing && (
        <div className="absolute inset-0 bottom-[80px] z-50 bg-background flex flex-col">
          <div className="header items-center truncate shrink-0">
            <button
              type="button"
              className="p-[8px] rounded-full hover:bg-muted mr-[8px] ml-[-8px]"
              title={t("Volver")}
              onClick={handleBack}
            >
              <ArrowLeft className="w-[24px] h-[24px]" />
            </button>
            <div className="text-[16px]">{t("Herramientas")}</div>
          </div>

          <SectionBody>
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

            {/* Simple Tools (Toggles) */}

            <div className="flex flex-col gap-[24px] pl-[10px] mt-[6px]">
              <div className="border-t border-border" />

              {/* Calculator */}
              {/* Calculator */}
              <label className="flex items-center gap-[12px] cursor-pointer justify-between">
                <div className="flex flex-col gap-[2px]">
                  <div className="text-foreground">{t("Calculadora")}</div>
                  <p className="text-muted-foreground text-[14px]">
                    {t("Evita errores de cálculo en LLMs")}
                  </p>
                </div>
                <Switch
                  checked={hasSimpleTool("calculator")}
                  onCheckedChange={() => toggleSimpleTool("calculator")}
                  className="mt-[4px]"
                />
              </label>
            </div>
          </SectionBody>
        </div>
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
