import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { useTranslation } from "@/hooks/useTranslation";
import { useModelTiers } from "@/queries/useModelTiers";
import SectionField from "@/components/SectionField";

/**
 * T2 — what an agent runs on, as a choice between three levels.
 *
 * This replaces seven fields: provider, protocol, API URL, model id, message
 * limit, temperature and a switch about forcing a synthetic tool. D12 —
 * whoever runs a shop is not a programmer, and «solo para admin» does not mean
 * «para alguien que lo entiende». A selector that says `chat_completions` was
 * on this screen.
 *
 * The agent stores a slug and nothing else. Everything the call needs —
 * provider, model id, protocol, whether a tool may be forced — is the row in
 * `public.model_tiers`, so the day a provider retires a model it is one UPDATE
 * on one row rather than a write per agent in every organization.
 *
 * Bringing your own key stays, behind a door: it is what makes a call not
 * consume platform credits, and it is the only place a provider is named.
 */

export const apiKeyInstructions: Record<
  string,
  { url: string; label: string; steps: string; free?: boolean }
> = {
  openai: {
    url: "https://platform.openai.com/api-keys",
    label: "platform.openai.com",
    steps: "API Keys > Create new secret key",
  },
  anthropic: {
    url: "https://console.anthropic.com/settings/keys",
    label: "console.anthropic.com",
    steps: "Settings > API Keys > Create Key",
  },
  google: {
    url: "https://aistudio.google.com/app/apikey",
    label: "aistudio.google.com",
    steps: "Get API key > Create API key",
    free: true,
  },
  groq: {
    url: "https://console.groq.com/keys",
    label: "console.groq.com",
    steps: "API Keys > Create API Key",
    free: true,
  },
};

type Props<T extends FieldValues> = {
  control: Control<T>;
  register: UseFormRegister<T>;
};

export default function ModelSection<T extends FieldValues>({
  control,
  register,
}: Props<T>) {
  const { translate: t } = useTranslation();
  const { data: tiers } = useModelTiers();

  const slug = useWatch({
    control,
    name: "extra.model_tier" as Path<T>,
  }) as string | undefined;

  const chosen = tiers?.find((tier) => tier.slug === slug);
  const instructions = chosen && apiKeyInstructions[chosen.provider];

  return (
    <>
      <div className="label">{t("Nivel de modelo")}</div>

      <div className="flex flex-col gap-[8px]">
        {tiers?.map((tier) => (
          <label
            key={tier.slug}
            className="flex cursor-pointer items-start gap-[10px]"
          >
            <input
              type="radio"
              value={tier.slug}
              className="mt-[4px]"
              {...register("extra.model_tier" as Path<T>)}
            />
            <div className="flex flex-col">
              <span>{tier.name}</span>
              {tier.description && (
                <span className="text-muted-foreground text-[14px]">
                  {tier.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      <SectionField label={t("Clave API propia")} description={t("Opcional")}>
        <p>
          {t(
            "Con tu propia clave, las respuestas no consumen créditos de la plataforma. Sin ella, el agente usa la clave de DropChat.",
          )}
        </p>

        <label>
          <div className="label">{t("Clave API")}</div>
          <input
            type="text"
            className="text"
            placeholder={t("Clave API del proveedor")}
            {...register("extra.api_key" as Path<T>)}
          />
        </label>

        {instructions && (
          <div className="instructions">
            <p>
              <strong>
                {instructions.free
                  ? t("Obtené una clave gratuita:")
                  : t("Obtené una clave:")}
              </strong>{" "}
              <a
                href={instructions.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {instructions.label}
              </a>
              {" > "}
              {instructions.steps}
            </p>
          </div>
        )}
      </SectionField>
    </>
  );
}
