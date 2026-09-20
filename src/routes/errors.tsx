// E1. The error panel.
//
// Deliberately not under /settings and not in the menu: settings belong to an
// organization and are read by customers, and this crosses organizations — an
// issue's sample can carry another tenant's ids. It is reached by typing the
// URL, and RLS is what actually guards it; the check below only decides what
// to draw.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";
import "dayjs/locale/pt";
import "dayjs/locale/fr";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Globe,
  RotateCcw,
  Server,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import Spinner from "@/components/Spinner";
import {
  type ErrorIssue,
  type ErrorStatus,
  useCloseErrorBaseline,
  useErrorIssues,
  useErrorSettings,
  useIsPlatformAdmin,
  useTriageErrorIssue,
} from "@/queries/useErrorIssues";

dayjs.extend(relativeTime);

export const Route = createFileRoute("/errors")({
  component: ErrorPanel,
});

type Filter = "open" | "all" | ErrorStatus;

const FILTERS: Filter[] = ["open", "resolved", "ignored", "preexisting", "all"];

/**
 * Labels are built by calling t() on the literal, never `t(someVariable)`:
 * translations:check scans the sources for t() applied to a string literal, so
 * a key reached through a variable is invisible to it and is reported as
 * unused in every locale. (Writing that call shape in this comment would also
 * register the example as a key — the scan does not know a comment from code.)
 */
function filterLabel(filter: Filter, t: (text: string) => string): string {
  switch (filter) {
    case "open":
      return t("Sin resolver");
    case "resolved":
      return t("Resueltos");
    case "ignored":
      return t("Ignorados");
    case "preexisting":
      return t("Preexistentes");
    case "all":
      return t("Todos");
    default:
      return filter;
  }
}

function SourceIcon({ source }: { source: ErrorIssue["source"] }) {
  const className = "w-[16px] h-[16px] shrink-0 text-muted-foreground";
  if (source === "frontend") return <Globe className={className} />;
  return <Server className={className} />;
}

function StatusBadge({ status }: { status: ErrorStatus }) {
  const { translate: t } = useTranslation();

  const styles: Record<ErrorStatus, string> = {
    new: "bg-destructive/10 text-destructive",
    acknowledged: "bg-accent text-accent-foreground",
    resolved: "bg-accent text-muted-foreground",
    ignored: "bg-accent text-muted-foreground",
    preexisting: "bg-accent text-muted-foreground",
  };

  // t() on the literal, not t(labels[status]) — see filterLabel above.
  const labels: Record<ErrorStatus, string> = {
    new: t("Nuevo"),
    acknowledged: t("Visto"),
    resolved: t("Resuelto"),
    ignored: t("Ignorado"),
    preexisting: t("Preexistente"),
  };

  return (
    <span
      className={`px-[8px] py-[2px] rounded-full text-[12px] shrink-0 ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

/**
 * The learning-mode banner. While it is up, nothing reaches the panel: every
 * fingerprint is filed as preexisting. It stays up until it is dismissed on
 * purpose, and it says how much it has catalogued so the decision is informed
 * rather than a guess.
 */
function BaselineBanner() {
  const { translate: t } = useTranslation();
  const settings = useErrorSettings();
  const preexisting = useErrorIssues("preexisting");
  const close = useCloseErrorBaseline();

  if (!settings.data?.baseline_open) return null;

  const catalogued = preexisting.data?.length ?? 0;

  return (
    <div className="mx-[20px] mb-[16px] p-[16px] rounded-xl bg-accent flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px] text-[16px]">
        <AlertTriangle className="w-[18px] h-[18px] shrink-0" />
        {t("Modo aprendizaje")}
      </div>
      <p className="text-[14px] text-muted-foreground leading-relaxed">
        {t(
          "Todo error que llega se archiva como preexistente y no aparece en la lista. Cerrá la línea base cuando lo que se está registrando ya represente el estado normal de la app: desde ese momento, cada error que no se haya visto antes entra como nuevo.",
        )}
      </p>
      <p className="text-[14px] text-muted-foreground">
        {catalogued === 0
          ? t("Todavía no se ha catalogado ningún error.")
          : `${catalogued} ${t("huellas catalogadas hasta ahora.")}`}
      </p>
      <button
        type="button"
        className="primary px-[20px] self-start"
        onClick={() => close.mutate()}
        disabled={close.isPending}
      >
        {close.isPending ? t("Cerrando…") : t("Cerrar línea base")}
      </button>
    </div>
  );
}

function IssueDetail({ issue }: { issue: ErrorIssue }) {
  const { translate: t, currentLanguage } = useTranslation();
  const triage = useTriageErrorIssue();
  // Per call, like the rest of the app: dayjs's locale is global state, and
  // setting it once here would change dates everywhere else too.
  const when = (value: string) =>
    dayjs(value).locale(currentLanguage).format("D MMM YYYY HH:mm");

  const sample = issue.last_sample as {
    stack?: string;
    release?: string;
    context?: Record<string, unknown>;
  } | null;

  const context = sample?.context ?? {};
  const requestId = context.request_id;

  const actions: { label: string; status: ErrorStatus; icon: typeof Check }[] =
    issue.status === "resolved" || issue.status === "ignored"
      ? [{ label: t("Reabrir"), status: "new", icon: RotateCcw }]
      : [
          { label: t("Resolver"), status: "resolved", icon: Check },
          { label: t("Ignorar"), status: "ignored", icon: EyeOff },
          {
            label: t("Marcar preexistente"),
            status: "preexisting",
            icon: EyeOff,
          },
        ];

  return (
    <div className="px-[20px] pb-[20px] pt-[4px] flex flex-col gap-[16px]">
      <div className="flex gap-[8px] flex-wrap">
        {actions.map(({ label, status, icon: Icon }) => (
          <button
            key={status}
            type="button"
            className="flex items-center gap-[6px] px-[12px] py-[6px] rounded-full border border-input hover:bg-accent text-[14px] disabled:opacity-50"
            onClick={() => triage.mutate({ id: issue.id, status })}
            disabled={triage.isPending}
          >
            <Icon className="w-[14px] h-[14px]" />
            {label}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-[16px] gap-y-[6px] text-[14px]">
        <dt className="text-muted-foreground">{t("Primera vez")}</dt>
        <dd>{when(issue.first_seen)}</dd>
        <dt className="text-muted-foreground">{t("Última vez")}</dt>
        <dd>{when(issue.last_seen)}</dd>
        {issue.regressed_at && (
          <>
            <dt className="text-muted-foreground">{t("Reapareció")}</dt>
            <dd>{when(issue.regressed_at)}</dd>
          </>
        )}
        {issue.release && (
          <>
            <dt className="text-muted-foreground">{t("Versión")}</dt>
            <dd className="font-mono text-[12px]">
              {issue.release.slice(0, 12)}
            </dd>
          </>
        )}
        {typeof requestId === "string" && (
          <>
            {/* The id that ties this row to the full log line in Supabase. */}
            <dt className="text-muted-foreground">{t("Request id")}</dt>
            <dd className="font-mono text-[12px] break-all">{requestId}</dd>
          </>
        )}
      </dl>

      {sample?.stack && (
        <div>
          <div className="label">{t("Stack")}</div>
          <pre className="text-[12px] bg-muted rounded-lg p-[12px] overflow-x-auto whitespace-pre-wrap break-words max-h-[300px]">
            {sample.stack}
          </pre>
        </div>
      )}

      {Object.keys(context).length > 0 && (
        <div>
          <div className="label">{t("Contexto")}</div>
          <pre className="text-[12px] bg-muted rounded-lg p-[12px] overflow-x-auto whitespace-pre-wrap break-words max-h-[300px]">
            {JSON.stringify(context, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ErrorIssue }) {
  const { translate: t, currentLanguage } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-input">
      <button
        type="button"
        className="w-full flex items-start gap-[10px] p-[14px] text-left hover:bg-accent rounded-xl"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="w-[16px] h-[16px] shrink-0 mt-[3px]" />
        ) : (
          <ChevronRight className="w-[16px] h-[16px] shrink-0 mt-[3px]" />
        )}
        <div className="min-w-0 grow flex flex-col gap-[4px]">
          <div className="flex items-center gap-[8px]">
            <SourceIcon source={issue.source} />
            <span className="text-[14px] text-muted-foreground shrink-0">
              {issue.kind}
            </span>
            <StatusBadge status={issue.status} />
          </div>
          <div className="text-[15px] break-words">{issue.title}</div>
          <div className="text-[13px] text-muted-foreground">
            {issue.culprit ?? t("sin ubicación")} ·{" "}
            {`${issue.events} ${issue.events === 1 ? t("vez") : t("veces")}`} ·{" "}
            {dayjs(issue.last_seen).locale(currentLanguage).fromNow()}
          </div>
        </div>
      </button>
      {open && <IssueDetail issue={issue} />}
    </div>
  );
}

function ErrorPanel() {
  const { translate: t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("open");

  const isAdmin = useIsPlatformAdmin();
  const issues = useErrorIssues(filter);

  // isPending, not isLoading: until useAuth has put the session in the store
  // the query is disabled, and a disabled query reports isLoading false with
  // no data — which read as "not an admin" and flashed the refusal screen at
  // the one person allowed in. The root route guarantees a user or a redirect
  // to /login, so this cannot hang.
  if (isAdmin.isPending) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Spinner size={24} />
      </div>
    );
  }

  // Not an error page: RLS already returns nothing to anyone else, so this is
  // only about not drawing a panel that would be permanently empty.
  if (!isAdmin.data) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-[8px] text-muted-foreground">
        <div className="text-[18px] text-foreground">
          {t("Sin acceso a este panel")}
        </div>
        <p className="text-[14px]">
          {t("Solo los administradores de plataforma pueden verlo.")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-y-auto">
      <div className="header items-center">
        <div className="text-[22px]">{t("Errores")}</div>
      </div>

      <BaselineBanner />

      <div className="px-[20px] flex gap-[8px] flex-wrap mb-[16px]">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={
              "px-[12px] py-[6px] rounded-full text-[14px] " +
              (filter === value
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent")
            }
            onClick={() => setFilter(value)}
          >
            {filterLabel(value, t)}
          </button>
        ))}
      </div>

      <div className="px-[20px] pb-[20px] flex flex-col gap-[8px]">
        {issues.isLoading && <Spinner size={24} />}

        {issues.data?.length === 0 && (
          <div className="text-[14px] text-muted-foreground py-[20px]">
            {filter === "open"
              ? t("Nada sin resolver. Es la lectura que se espera.")
              : t("No hay errores con este filtro.")}
          </div>
        )}

        {issues.data?.map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}
