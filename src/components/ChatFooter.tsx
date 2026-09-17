import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  newMessage,
  pushMessageToDb,
  pushMessageToStore,
} from "@/utils/MessageUtils";
import useBoundStore from "@/stores/useBoundStore";
import { pushConversationToDb, saveDraft } from "@/utils/ConversationUtils";
import { type FileDraft } from "@/stores/chatSlice";
import { type Draft } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgent } from "@/queries/useAgents";
import { moveCursorToEnd } from "@/utils/UtilityFunctions";
import { htmlToMarkdown } from "@/utils/htmlToMarkdown";
import TemplatePicker from "./TemplatePicker";
import TemplateComposer from "./chat-footer/TemplateComposer";
import {
  allVariablesFilled,
  buildTemplateMessage,
  templateParts,
  templateSections,
  templateVarCounts,
} from "./chat-footer/template";
import { useCustomerServiceWindow } from "./chat-footer/useCustomerServiceWindow";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import { accountAuthFailure } from "@/utils/accountAuthFailure";
import AccountAuthNotice from "./AccountAuthNotice";

// F29: the template logic (chat-footer/template.ts), the template composer
// and its inputs, and the 24-hour window (useCustomerServiceWindow) live in
// chat-footer/. This component keeps the text composer, attachments and the
// send paths.

export default function ChatFooter() {
  const activeConvId = useBoundStore((store) => store.ui.activeConvId);
  const conv = useBoundStore((store) =>
    store.chat.conversations.get(store.ui.activeConvId || ""),
  );
  const draft: Draft | null | undefined = useBoundStore((store) =>
    store.chat.membershipExtras.get(store.ui.activeConvId || ""),
  )?.draft;
  const toggle = useBoundStore((store) => store.ui.toggle);
  const templatePicker = useBoundStore((store) => store.ui.templatePicker);
  const templateDraftEntry = useBoundStore((store) =>
    store.ui.templateDrafts.get(store.ui.activeConvId || ""),
  );
  const setTemplateDraft = useBoundStore((store) => store.ui.setTemplateDraft);
  const message = useBoundStore((store) =>
    store.chat.textDrafts.get(store.ui.activeConvId || ""),
  );
  const setConversationTextDraft = useBoundStore(
    (store) => store.chat.setConversationTextDraft,
  );
  const setMessage = (message: string) =>
    setConversationTextDraft(activeConvId || "", message);

  const fileDrafts = useBoundStore((store) =>
    store.chat.fileDrafts.get(store.ui.activeConvId || ""),
  );
  const setConversationFileDrafts = useBoundStore(
    (store) => store.chat.setConversationFileDrafts,
  );
  const setFileDrafts = (fileDrafts: FileDraft[]) =>
    setConversationFileDrafts(activeConvId || "", fileDrafts);

  const { data: agent } = useCurrentAgent();
  const agentId = agent?.id;

  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>();

  const editableDiv = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { translate: t } = useTranslation();

  const { inCSWindow, remaining } = useCustomerServiceWindow(conv);

  // F28: the account's token was rejected; sends from it will fail.
  const { data: orgAddresses } = useOrganizationsAddresses();
  const authFailure = accountAuthFailure(
    conv &&
      orgAddresses?.find(
        (address) =>
          address.service === conv.service &&
          address.address === conv.organization_address,
      ),
  );

  // Template mode: derive from per-conv store
  const templateDraft = templateDraftEntry?.template;
  const bodyVarValues = templateDraftEntry?.bodyVarValues || [];
  const headVarValues = templateDraftEntry?.headVarValues || [];

  const sections = templateSections(templateDraft);
  const { templateBody, templateHead } = sections;

  const bodyExamples = templateBody?.example?.body_text[0] || [];
  const headExamples = templateHead?.example?.header_text || [];

  // Count how many variables are in the template body/header
  const { bodyVarCount, headVarCount } = templateVarCounts(sections);

  const allVarsFilled =
    !!templateDraft &&
    allVariablesFilled(
      { bodyVarCount, headVarCount },
      bodyVarValues,
      headVarValues,
    );

  function updateVarValues(bodyVars: string[], headVars: string[]) {
    if (!activeConvId || !templateDraftEntry) return;
    setTemplateDraft(activeConvId, {
      ...templateDraftEntry,
      bodyVarValues: bodyVars,
      headVarValues: headVars,
    });
  }

  useEffect(() => {
    if (!editableDiv.current) {
      return;
    }

    if (!inCSWindow) {
      editableDiv.current.textContent = "";
      return;
    }

    editableDiv.current.textContent = message || "";

    // do not steal the focus from the file previewer
    if (
      !fileDrafts?.length &&
      window.matchMedia("(min-width: 768px)").matches
    ) {
      moveCursorToEnd(editableDiv.current);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, fileDrafts]);

  // Load the stored draft
  useEffect(() => {
    if (!activeConvId || !conv) {
      return;
    }

    // Note: draft is the DB stored draft; message (textDraft) is just an UI buffer
    const shouldLoadDraft = inCSWindow && draft?.text && !message; // do not overwrite a current message

    if (shouldLoadDraft) {
      clearTimeout(timer);

      setMessage(draft.text);

      if (editableDiv.current) {
        editableDiv.current.textContent = draft.text;
        if (window.matchMedia("(min-width: 768px)").matches) {
          moveCursorToEnd(editableDiv.current);
        }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, draft]);

  const sendTextMessage = async () => {
    if (!activeConvId || !conv || !message) {
      return;
    }

    clearTimeout(timer);

    // If the conv has the `updated_at` unset, it means it has not been pushed to the DB yet.
    !conv.updated_at && (await pushConversationToDb(conv));

    const record = newMessage(
      conv,
      {
        version: "1",
        type: "text",
        kind: "text",
        text: message,
      },
      agentId,
    );

    pushMessageToStore({ ...record, conversation_id: conv.id });
    await pushMessageToDb(record);

    setMessage("");
    // TODO: optimization: combine with the updateConvExtra call - cabra 2025-01-16
    draft && saveDraft(conv, "").catch(console.error);

    if (editableDiv.current) {
      editableDiv.current.textContent = "";
    }
  };

  const sendTemplateMessage = async () => {
    if (!activeConvId || !conv || !templateDraft || !templateBody) {
      return;
    }

    // If the conv has the `updated_at` unset, it means it has not been pushed to the DB yet.
    !conv.updated_at && (await pushConversationToDb(conv));

    const { template, renderedBody } = buildTemplateMessage(
      templateDraft,
      sections,
      bodyVarValues,
      headVarValues,
    );

    const record = newMessage(
      conv,
      {
        version: "1",
        type: "data",
        kind: "template",
        data: template,
        text: renderedBody,
      },
      agentId,
    );

    pushMessageToStore(record);
    await pushMessageToDb(record);

    setTemplateDraft(activeConvId, null);
  };

  function debounce(fn: () => void, ms: number) {
    clearTimeout(timer);
    setTimer(setTimeout(fn, ms));
  }

  return (
    activeConvId &&
    conv && (
      <div className="relative mx-[12px] mb-[12px] mt-[4px] lg:mt-[0px] z-10">
        {templatePicker && <TemplatePicker />}
        {authFailure && <AccountAuthNotice failure={authFailure} compact />}
        <div
          className={
            "flex items-end text-foreground p-[5px] rounded-[24px] shadow-[0_0_4px_0px_rgba(0,0,0,0.1)]" +
            (templateDraft
              ? " bg-incoming-chat-bubble"
              : !inCSWindow
                ? " bg-background"
                : " bg-incoming-chat-bubble")
          }
        >
          <div className="shrink-0">
            {templateDraft ? (
              <button
                className="p-[8px] rounded-full cursor-pointer hover:bg-accent"
                onClick={() => setTemplateDraft(activeConvId, null)}
                title={t("Descartar plantilla")}
              >
                <X className="w-[24px] h-[24px]" />
              </button>
            ) : (
              <button
                disabled={!inCSWindow}
                className={
                  "p-[8px] rounded-full" +
                  (!inCSWindow ? "" : " cursor-pointer hover:bg-accent")
                }
                onClick={() => fileInput.current?.click()}
                title={t("Adjuntar")}
              >
                <Plus className="w-[24px] h-[24px]" />
              </button>
            )}
          </div>

          <input
            disabled={!inCSWindow}
            ref={fileInput}
            type="file"
            multiple={true}
            className="hidden"
            accept="*/*"
            onChange={(event) => {
              if (!event.target.files?.length) {
                return;
              }

              const drafts = Array.from(event.target.files).map<FileDraft>(
                (file) => ({
                  file,
                }),
              );

              drafts[0].caption = message;

              setFileDrafts(drafts);
            }}
          />

          {/* Text input or template mode */}
          <div className="relative grow">
            {templateDraft ? (
              templateBody && (
                <TemplateComposer
                  parts={templateParts(sections, headVarCount)}
                  headExamples={headExamples}
                  bodyExamples={bodyExamples}
                  headVarValues={headVarValues}
                  bodyVarValues={bodyVarValues}
                  updateVarValues={updateVarValues}
                  allVarsFilled={!!allVarsFilled}
                  onSend={() => {
                    sendTemplateMessage().catch(console.error);
                  }}
                />
              )
            ) : (
              <>
                <div
                  ref={editableDiv}
                  contentEditable={inCSWindow}
                  className={`${
                    !inCSWindow ? "cursor-pointer" : ""
                  } outline-none mx-[5px] py-[10px] min-h-[40px] max-h-40 overflow-y-auto text-[15px] leading-[20px] break-words`}
                  onInput={(event) => {
                    if (!(event.target instanceof Element)) {
                      return;
                    }

                    // Use secure utility to sanitize and convert HTML to Markdown
                    const message = htmlToMarkdown(
                      event.currentTarget.innerHTML,
                    );

                    setMessage(message);

                    if (conv.created_at !== conv.updated_at) {
                      // no drafts for new convs, sorry!
                      debounce(() => saveDraft(conv, message), 3000); // milliseconds
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      window.matchMedia("(min-width: 768px)").matches
                    ) {
                      event.preventDefault();
                      sendTextMessage().catch(console.error);
                    }
                  }}
                  onClick={() =>
                    !inCSWindow &&
                    conv.service === "whatsapp" &&
                    toggle("templatePicker")
                  }
                  title={
                    inCSWindow
                      ? undefined
                      : conv.service === "whatsapp"
                        ? t(
                            "WhatsApp cierra la conversación a las 24 horas del último mensaje recibido. Para abrir la conversación debes utilizar una plantilla.",
                          )
                        : t(
                            "La conversación se cerró 24 horas después del último mensaje del contacto. Esperá a que te escriba de nuevo para responder.",
                          )
                  }
                />
                {!message && (
                  <div
                    className={
                      "absolute bottom-[1px] py-[10px] mx-[5px] max-h-[40px] text-[15px] text-muted-foreground" +
                      (inCSWindow ? "" : " cursor-pointer")
                    }
                    onClick={() =>
                      inCSWindow
                        ? editableDiv.current?.focus()
                        : conv.service === "whatsapp"
                          ? toggle("templatePicker")
                          : undefined
                    }
                  >
                    {!inCSWindow ? (
                      conv.service === "whatsapp" ? (
                        <>
                          <span className="lg:hidden">
                            {t("Conversación cerrada")}
                          </span>
                          <span className="hidden lg:inline">
                            {t(
                              "Conversación cerrada, abre la conversación con una plantilla",
                            )}
                          </span>
                        </>
                      ) : (
                        <span>{t("Conversación cerrada")}</span>
                      )
                    ) : conv.service === "whatsapp" ||
                      conv.service === "instagram" ? (
                      <>
                        <span className="lg:hidden">{t("Cerrará en")}</span>
                        <span className="hidden lg:inline">
                          {t("La conversación cerrará en")}
                        </span>{" "}
                        <span>{remaining}</span>
                      </>
                    ) : (
                      <span>{t("Escribe un mensaje")}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Send button */}
          <button
            disabled={templateDraft ? !allVarsFilled : !inCSWindow}
            className={
              "p-[8px] rounded-full bg-primary disabled:opacity-50" +
              (templateDraft
                ? allVarsFilled
                  ? " cursor-pointer"
                  : ""
                : !inCSWindow
                  ? ""
                  : " cursor-pointer")
            }
            onClick={() => {
              if (templateDraft) {
                allVarsFilled && sendTemplateMessage().catch(console.error);
              } else if (message) {
                sendTextMessage().catch(console.error);
              }
            }}
            title={templateDraft ? t("Enviar plantilla") : t("Enviar mensaje")}
          >
            <svg className="w-[24px] h-[24px] transition text-primary-foreground">
              <use href="/icons.svg#send" />
            </svg>
          </button>
        </div>
      </div>
    )
  );
}
