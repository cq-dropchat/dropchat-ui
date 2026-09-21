import { useState } from "react";
import { X } from "lucide-react";
import {
  Controller,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { useTranslation } from "@/hooks/useTranslation";
import type { OrganizationUpdate } from "@/supabase/client";
import { BUSINESS_PROFILE_LIMITS as LIMITS } from "@/supabase/types/business_profile";

/**
 * T1 — what the business sells, ships and charges.
 *
 * This replaces the box that said «Instrucciones de tu negocio» and waited for
 * a merchant to write a system prompt. D12: every question here is about the
 * shop — a shoe shop knows its delivery times and its return policy, and knows
 * none of them as a paragraph addressed to a model.
 *
 * The profile fills slot 2 of the system prompt, ahead of the agent's own
 * instructions, so what is typed here is read by the agent on every single
 * message. That is why each field carries the same ceiling the API validates
 * against, read from the mirrored module rather than typed again here.
 */

/**
 * The methods a Chilean shop is likely to take. The VALUE is stored and read
 * by the model, so it stays in Spanish in every locale; only the label is
 * translated, and the proper nouns are not translated at all.
 */
const SUGGESTED = [
  { value: "Webpay", label: "Webpay" },
  { value: "Mercado Pago", label: "Mercado Pago" },
  { value: "Khipu", label: "Khipu" },
  { value: "MACH", label: "MACH" },
] as const;

type Props = {
  register: UseFormRegister<OrganizationUpdate>;
  control: Control<OrganizationUpdate>;
  disabled: boolean;
};

export default function BusinessProfileFields({
  register,
  control,
  disabled,
}: Props) {
  const { translate: t } = useTranslation();

  const translated = [
    { value: "Transferencia bancaria", label: t("Transferencia bancaria") },
    { value: "Tarjeta de crédito", label: t("Tarjeta de crédito") },
    { value: "Tarjeta de débito", label: t("Tarjeta de débito") },
    { value: "Efectivo contra entrega", label: t("Efectivo contra entrega") },
  ];

  const methods = [...SUGGESTED, ...translated];

  return (
    <>
      <div className="label pt-[10px]">{t("Perfil del negocio")}</div>

      <p className="text-sm opacity-70">
        {t(
          "Lo que la IA necesita saber de tu negocio para responder sin inventar. Precios en pesos chilenos (CLP).",
        )}
      </p>

      <label>
        <div className="label">{t("Rubro")}</div>
        <input
          className="text"
          placeholder={t("Zapatillas urbanas")}
          maxLength={LIMITS.industry}
          disabled={disabled}
          {...register("extra.business_profile.industry")}
        />
      </label>

      <label>
        <div className="label">{t("Qué vende")}</div>
        <textarea
          className="text min-h-[72px]"
          placeholder={t("Zapatillas de calle y running, tallas 35 a 45.")}
          maxLength={LIMITS.sells}
          disabled={disabled}
          {...register("extra.business_profile.sells")}
        />
      </label>

      <label>
        <div className="label">{t("Cobertura de despacho")}</div>
        <textarea
          className="text min-h-[72px]"
          placeholder={t("Todo Chile continental; retiro en tienda en Ñuñoa.")}
          maxLength={LIMITS.shipping_coverage}
          disabled={disabled}
          {...register("extra.business_profile.shipping_coverage")}
        />
      </label>

      <label>
        <div className="label">{t("Plazos de entrega")}</div>
        <input
          className="text"
          placeholder={t("24 a 48 horas en Santiago, 3 a 5 días en regiones.")}
          maxLength={LIMITS.shipping_times}
          disabled={disabled}
          {...register("extra.business_profile.shipping_times")}
        />
      </label>

      <PaymentMethods control={control} disabled={disabled} methods={methods} />

      <label>
        <div className="label">{t("Cambios y devoluciones")}</div>
        <textarea
          className="text min-h-[72px]"
          placeholder={t("Cambio por talla dentro de 30 días con boleta.")}
          maxLength={LIMITS.returns_policy}
          disabled={disabled}
          {...register("extra.business_profile.returns_policy")}
        />
      </label>
    </>
  );
}

/**
 * The one control here that is not a box with text in it.
 *
 * `extra` is saved as a JSON merge patch and a merge patch replaces an array
 * WHOLE (§3.6), so this field always hands over every method the shop takes,
 * never the one that was just touched. Ticking is therefore "these are all of
 * them now", which is also why the empty state is written as a sentence rather
 * than left blank.
 */
function PaymentMethods({
  control,
  disabled,
  methods,
}: {
  control: Control<OrganizationUpdate>;
  disabled: boolean;
  methods: { value: string; label: string }[];
}) {
  const { translate: t } = useTranslation();
  const [draft, setDraft] = useState("");

  return (
    <Controller
      name="extra.business_profile.payment_methods"
      control={control}
      render={({ field }) => {
        const chosen: string[] = field.value ?? [];
        const full = chosen.length >= LIMITS.payment_methods;

        const toggle = (value: string) =>
          field.onChange(
            chosen.includes(value)
              ? chosen.filter((m) => m !== value)
              : [...chosen, value],
          );

        const add = () => {
          const value = draft.trim().slice(0, LIMITS.payment_method);
          if (!value || chosen.includes(value) || full) return;
          field.onChange([...chosen, value]);
          setDraft("");
        };

        // Whatever the shop takes that is not on the suggested list, saved
        // earlier or typed just now.
        const custom = chosen.filter(
          (value) => !methods.some((m) => m.value === value),
        );

        return (
          <div className="flex flex-col gap-[8px]">
            <div className="label">{t("Medios de pago")}</div>

            <div className="flex flex-wrap gap-[6px]">
              {methods.map((method) => {
                const on = chosen.includes(method.value);
                return (
                  <button
                    key={method.value}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => toggle(method.value)}
                    className={`rounded-full border px-[12px] py-[4px] text-sm ${
                      on ? "bg-primary text-primary-foreground" : "opacity-70"
                    }`}
                  >
                    {method.label}
                  </button>
                );
              })}

              {custom.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={true}
                  disabled={disabled}
                  onClick={() => toggle(value)}
                  className="bg-primary text-primary-foreground flex items-center gap-[4px] rounded-full border px-[12px] py-[4px] text-sm"
                >
                  {value}
                  <X className="h-[14px] w-[14px]" />
                </button>
              ))}
            </div>

            <div className="flex items-end gap-[8px]">
              <label className="grow">
                <div className="label">{t("Otro medio de pago")}</div>
                <input
                  className="text"
                  value={draft}
                  maxLength={LIMITS.payment_method}
                  disabled={disabled || full}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter inside a form submits it; here it adds a method.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      add();
                    }
                  }}
                />
              </label>

              <button
                type="button"
                className="rounded-full border px-[12px] py-[6px] text-sm"
                disabled={disabled || full || draft.trim() === ""}
                onClick={add}
              >
                {t("Agregar")}
              </button>
            </div>
          </div>
        );
      }}
    />
  );
}
