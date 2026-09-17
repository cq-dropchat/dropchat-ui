import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type AccountAuthFailure,
  formatAuthFailureDate,
} from "@/utils/accountAuthFailure";

// F28: the provider rejected this account's token. Every member sees why and
// since when; the reconnect action (passed in) is for those who can manage it.
export default function AccountAuthNotice({
  failure,
  compact = false,
  action,
}: {
  failure: AccountAuthFailure;
  compact?: boolean;
  action?: ReactNode;
}) {
  const { translate: t } = useTranslation();
  const date = formatAuthFailureDate(failure.at);

  if (compact) {
    return (
      <div
        role="alert"
        className="mb-[6px] px-[14px] py-[6px] rounded-[16px] bg-destructive/10 text-destructive text-[13px]"
      >
        {t(
          "No se pueden enviar mensajes: el token de la cuenta fue rechazado el",
        )}{" "}
        {date}. {t("Hay que reconectarla desde Integraciones.")}
      </div>
    );
  }

  return (
    <div className="instructions" role="alert">
      <p className="text-destructive">
        {t(
          "El token de acceso de esta cuenta fue rechazado. Los mensajes salientes fallan hasta que la reconectes.",
        )}
      </p>
      {failure.message && (
        <p>
          {t("Motivo")}: {failure.message}
        </p>
      )}
      <p>
        {t("Desde")}: {date}
      </p>
      {action}
    </div>
  );
}
