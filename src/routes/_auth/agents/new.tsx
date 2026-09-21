import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import SectionFooter from "@/components/SectionFooter";
import { useTranslation } from "@/hooks/useTranslation";
import { useCreateAgent, useCurrentAgent } from "@/queries/useAgents";
import { useForm } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import { type AIAgentInsert } from "@/supabase/client";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import ToolsSection from "@/components/ToolsSection";
import ModelSection from "@/components/ModelSection";
import SectionItem from "@/components/SectionItem";
import TemplateGallery from "@/components/TemplateGallery";

export const Route = createFileRoute("/_auth/agents/new")({
  component: AddAgent,
});

function AddAgent() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const { data: currentAgent } = useCurrentAgent();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  // T7: where the agent comes from. Asked FIRST, because the answer decides
  // whether anything technical is asked at all — from a template, nothing is.
  const [source, setSource] = useState<null | "blank" | "template">(null);

  const open = (agentId: string) =>
    navigate({ to: `/agents/${agentId}`, hash: (prevHash) => prevHash! });

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isValid, isDirty },
  } = useForm<AIAgentInsert>({
    defaultValues: {
      extra: {
        mode: "active",
        // T2: the cheapest level, which is what this screen used to default
        // to by spelling out groq and a model id.
        model_tier: "rapido",
        tools: [],
      },
    },
  });

  const onSubmit = (data: AIAgentInsert) => {
    createAgent.mutate(data, { onSuccess: (agent) => open(agent.id) });
  };

  if (source === null) {
    return (
      <>
        <SectionHeader title={t("Agregar agente")} />

        <SectionBody>
          <SectionItem
            title={t("Desde una plantilla")}
            description={t(
              "Un agente ya escrito para un trabajo: ventas, postventa, reservas.",
            )}
            aside={
              <div className="bg-primary/10 rounded-full p-[8px]">
                <LayoutTemplate className="text-primary h-[24px] w-[24px]" />
              </div>
            }
            disabled={!isAdmin}
            disabledReason={t("Requiere permisos de administrador")}
            onClick={() => setSource("template")}
          />

          <SectionItem
            title={t("En blanco")}
            description={t("Lo escribís vos, desde cero.")}
            aside={
              <div className="bg-muted rounded-full p-[8px]">
                <FilePlus2 className="h-[24px] w-[24px]" />
              </div>
            }
            disabled={!isAdmin}
            disabledReason={t("Requiere permisos de administrador")}
            onClick={() => setSource("blank")}
          />
        </SectionBody>
      </>
    );
  }

  if (source === "template") {
    return (
      <>
        <SectionHeader title={t("Desde una plantilla")} />

        <SectionBody>
          <TemplateGallery onInstalled={open} />
        </SectionBody>
      </>
    );
  }

  return (
    <>
      <SectionHeader title={t("Agregar agente")} />

      <SectionBody>
        <form id="create-agent-form" onSubmit={handleSubmit(onSubmit)}>
          <fieldset disabled={!isAdmin} className="contents">
            <p>
              {t(
                "Configura un agente de IA que responderá automáticamente a tus conversaciones.",
              )}
            </p>

            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                type="text"
                className="text"
                placeholder={t("Nombre del agente")}
                {...register("name", { required: true })}
              />
            </label>

            <SelectField
              name="extra.mode"
              control={control}
              label={t("Estado")}
              options={[
                { value: "active", label: t("Activo") },
                { value: "inactive", label: t("Inactivo") },
              ]}
            />

            <div className="border-t border-border" />

            <TextAreaField
              name="extra.instructions"
              control={control}
              label={t("Instrucciones")}
              placeholder={t("Eres un asistente útil...")}
            />

            {/* Tools Section */}
            <ToolsSection
              control={control}
              register={register}
              setValue={setValue}
            />

            {/* T2: what the agent runs on. Three levels instead of the
                seven fields this used to ask for (D12). */}
            <ModelSection control={control} register={register} />
          </fieldset>
        </form>
      </SectionBody>

      <SectionFooter>
        <Button
          form="create-agent-form"
          type="submit"
          disabled={!isAdmin}
          invalid={!isValid || !isDirty}
          loading={createAgent.isPending}
          disabledReason={t("Requiere permisos de administrador")}
          className="primary"
        >
          {t("Crear")}
        </Button>
      </SectionFooter>
    </>
  );
}
