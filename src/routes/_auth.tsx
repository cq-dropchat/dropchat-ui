import { createFileRoute, Outlet } from "@tanstack/react-router";
import useBoundStore from "@/stores/useBoundStore";
import Menu from "@/components/Menu";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import ActionCard from "@/components/ActionCard";
import { useTranslation } from "@/hooks/useTranslation";
import { Bot, Building2, MessageSquarePlus, Settings } from "lucide-react";
import { useResizable } from "@/hooks/useResizable";
import { useCurrentAgents } from "@/queries/useAgents";
import RouteError from "@/components/RouteError";
import { useEscalationNotices } from "@/hooks/useEscalationNotices";
import { centerPanel } from "@/utils/centerPanel";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";

// F22: this layout is on every signed-in screen, but the conversation panel
// renders only once a conversation is open and the stats only on /stats.
// Loaded lazily, recharts (stats) and turndown/he, remarkable, autolinker
// (composer and message rendering) leave the first screen.
const Chat = lazy(() => import("@/components/Chat"));
const ChatHeader = lazy(() => import("@/components/ChatHeader"));
const SimulatorBar = lazy(() => import("@/components/SimulatorBar"));
const ChatFooter = lazy(() => import("@/components/ChatFooter"));
const FilePicker = lazy(() => import("@/components/FileUploader/FilePicker"));
const FilePreviewer = lazy(() => import("@/components/FilePreviewer"));
const StatsCenter = lazy(() => import("@/components/stats/StatsCenter"));
// T7: the platform's template panel. Lazy like the rest: a tenant never opens
// it, so it has no business being in anybody's first screen.
const TemplateCenter = lazy(
  () => import("@/components/templates/TemplateCenter"),
);

export const Route = createFileRoute("/_auth")({
  component: AppLayout,
  errorComponent: RouteError,
});

const MIN_PANEL_WIDTH = 300;

function getMenuWidth() {
  return window.innerWidth >= 1024 ? 64 : 48;
}

function getMaxPanelWidth() {
  // Max is 1/2 of available space (equal to chat panel)
  const availableSpace = window.innerWidth - getMenuWidth();
  return Math.floor(availableSpace / 2);
}

function AppLayout() {
  const { translate: t } = useTranslation();
  // H5: a conversation handed to a person has to reach somebody — the tab's
  // title counts them and, with permission, the browser says so.
  useEscalationNotices();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const { data: agents } = useCurrentAgents();
  const hasAiAgents = agents?.some((a) => a.user_id === null);
  const activeConvId = useBoundStore((state) => state.ui.activeConvId);
  const setActiveConv = useBoundStore((state) => state.ui.setActiveConv);
  const location = useLocation();
  const pathname = location.pathname;
  // T7: the template panel is the platform's, and the center is not handed
  // over to somebody who may not have it — on a phone that would be a blank
  // column with the menu hidden behind it.
  const { data: isPlatformAdmin } = useIsPlatformAdmin();

  // What the center column shows, and whether there is one at all.
  const center = centerPanel(pathname, activeConvId, isPlatformAdmin);

  const [isHoveringFiles, setIsHoveringFiles] = useState(false);

  const {
    width: panelWidth,
    panelRef,
    handleMouseDown,
  } = useResizable({
    minWidth: MIN_PANEL_WIDTH,
    getMaxWidth: getMaxPanelWidth,
  });

  // Sync fragment identifier with activeConvId
  // i.e. /conversations#1234
  useEffect(() => {
    const convId = location.hash;
    setActiveConv(convId);
  }, [location.hash]);

  console.log("--------");
  console.log("active org ", activeOrgId);
  console.log("active conv", activeConvId);

  const showCenterPanel = center !== "actions";

  return (
    <div
      className="app-grid"
      style={
        panelWidth !== null
          ? { gridTemplateColumns: `${getMenuWidth()}px ${panelWidth}px 1fr` }
          : undefined
      }
    >
      {/* Menu - Fixed width */}
      <div className={showCenterPanel ? "hidden md:flex" : "flex"}>
        <Menu />
      </div>
      {/* Left Panel - Router Outlet */}
      <div
        ref={panelRef}
        className={
          "flex-col overflow-hidden md:border-r border-border bg-background text-foreground col-span-2 md:col-span-1 relative " +
          (showCenterPanel ? "hidden md:flex" : "flex")
        }
      >
        <Outlet />
        {/* Resize Handle */}
        <div className="resize-handle z-[60]" onMouseDown={handleMouseDown} />
      </div>

      {/* Center Panel */}
      <div
        className={
          "flex-col min-w-0 relative overflow-hidden col-span-full md:col-span-1" +
          (center === "stats" || center === "templates"
            ? " flex bg-muted"
            : center === "chat"
              ? " flex bg-chat"
              : " hidden md:flex bg-muted")
        }
        onDragEnter={() => setIsHoveringFiles(true)}
        onDrop={() => setIsHoveringFiles(false)}
      >
        {center === "stats" ? (
          <div className="overflow-y-auto h-full">
            <Suspense fallback={null}>
              <StatsCenter />
            </Suspense>
          </div>
        ) : center === "templates" ? (
          // No wrapper with its own scroll: it has a header of its own that
          // must not scroll away, like a conversation.
          <Suspense fallback={null}>
            <TemplateCenter />
          </Suspense>
        ) : center === "chat" ? (
          <Suspense fallback={null}>
            {isHoveringFiles && <FilePicker setHovering={setIsHoveringFiles} />}
            <FilePreviewer />
            <ChatHeader />
            {/* S1: renders nothing unless the open conversation is a drill. */}
            <SimulatorBar />
            <Chat />
            <ChatFooter />
          </Suspense>
        ) : (
          <div className="flex gap-[32px] items-center justify-center h-full">
            {!activeOrgId && (
              <ActionCard
                icon={<Building2 className="w-[24px] h-[24px]" />}
                title={t("Crear organización")}
                to="/settings/organization/new"
              />
            )}
            {activeOrgId && (
              <>
                {!hasAiAgents && (
                  <ActionCard
                    icon={<Bot className="w-[24px] h-[24px]" />}
                    title={t("Crear agente")}
                    to="/agents/new"
                  />
                )}
                {hasAiAgents && (
                  <ActionCard
                    icon={<MessageSquarePlus className="w-[24px] h-[24px]" />}
                    title={t("Iniciar conversación")}
                    to="/conversations/new"
                  />
                )}
                <ActionCard
                  icon={<Settings className="w-[24px] h-[24px]" />}
                  title={t("Configurar WhatsApp")}
                  to="/integrations/whatsapp/new"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
