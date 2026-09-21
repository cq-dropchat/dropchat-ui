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
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

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
  /** The name of the agent this engine belongs to. */
  owner?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Without the card, for a screen that is still a flat column of fields. */
  plain?: boolean;
};

export default function ModelSection<T extends FieldValues>({
  control,
  register,
  owner,
  disabled,
  disabledReason,
  plain,
}: Props<T>) {
  const { translate: t } = useTranslation();
  const { data: tiers, isPending } = useModelTiers();

  const slug = useWatch({
    control,
    name: "extra.model_tier" as Path<T>,
  }) as string | undefined;

  const chosen = tiers?.find((tier) => tier.slug === slug);
  const instructions = chosen && apiKeyInstructions[chosen.provider];

  const tierChoice = (
    <fieldset
      disabled={disabled}
      className="flex min-w-0 flex-col gap-[8px] border-0 p-0 disabled:opacity-60"
    >
      <legend className="label mb-0">{t("Nivel de modelo")}</legend>
      <span className="hint">
        {t("Cuánto piensa antes de contestar. Podés cambiarlo cuando quieras.")}
      </span>

      {/* A list on its way and a list with nothing in it used to look the
          same: an empty space where the only real choice of the screen goes. */}
      {isPending &&
        [0, 1, 2].map((row) => (
          <div
            key={row}
            className="border-border flex flex-col gap-[6px] rounded-[12px] border p-[12px]"
          >
            <Skeleton width={110} />
            <Skeleton width={210} height={12} />
          </div>
        ))}

      {tiers?.map((tier) => {
        const selected = tier.slug === slug;

        return (
          <label
            key={tier.slug}
            className={`flex min-h-[44px] cursor-pointer items-start gap-[10px] rounded-[12px] border p-[11px_12px] transition-colors ${
              selected
                ? "border-primary bg-primary-veil"
                : "border-border bg-card hover:border-input"
            }`}
          >
            <input
              type="radio"
              value={tier.slug}
              className="mt-[3px] h-[16px] w-[16px] shrink-0 accent-[var(--primary)]"
              {...register("extra.model_tier" as Path<T>)}
            />
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className="text-[15px] font-semibold">{tier.name}</span>
              {tier.description && (
                <span
                  className={`text-[13px] leading-[1.4] ${selected ? "text-secondary-foreground" : "text-muted-foreground"}`}
                >
                  {tier.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );

  const apiKey = (
    <SectionField
      label={t("Clave API propia")}
      description={
        chosen && slug
          ? t("Sin clave: las respuestas usan los créditos de DropChat.")
          : t("Opcional")
      }
      owner={owner}
      plain={plain}
      last={!plain}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      <p className="text-secondary-foreground text-[14px] leading-[1.5]">
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
          disabled={disabled}
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
  );

  if (plain) {
    return (
      <>
        {tierChoice}
        {apiKey}
      </>
    );
  }

  return (
    <Card title={t("Motor")} padded={false}>
      <div className="p-[10px_16px_14px_16px]">{tierChoice}</div>
      {apiKey}
    </Card>
  );
}
