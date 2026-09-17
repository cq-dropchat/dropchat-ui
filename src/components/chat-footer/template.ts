import type { TemplateData, TemplateMessage } from "@/supabase/client";

/** The template's header, body, footer and buttons components. */
export function templateSections(templateDraft: TemplateData | undefined) {
  return {
    templateBody: templateDraft?.components.find((c) => c.type === "BODY"),
    templateHead: templateDraft?.components.find((c) => c.type === "HEADER"),
    templateFoot: templateDraft?.components.find((c) => c.type === "FOOTER"),
    templateButtons: templateDraft?.components.find(
      (c) => c.type === "BUTTONS",
    ),
  };
}

export type TemplateSections = ReturnType<typeof templateSections>;

/** How many `{{n}}` variables the body and the header have. */
export function templateVarCounts({
  templateBody,
  templateHead,
}: TemplateSections) {
  return {
    bodyVarCount: (templateBody?.text.match(/\{\{\d+\}\}/g) || []).length,
    headVarCount: (templateHead?.text?.match(/\{\{\d+\}\}/g) || []).length,
  };
}

/** A piece of the rendered template: text, or the slot of a variable. */
export type TemplatePart = string | { varIndex: number; isHeader: boolean };

/** The header, body and footer as text with variable slots in place. */
export function templateParts(
  { templateBody, templateHead, templateFoot }: TemplateSections,
  headVarCount: number,
): TemplatePart[] {
  const parts: TemplatePart[] = [];

  if (!templateBody) return parts;

  // Render header if present
  if (templateHead?.text && headVarCount > 0) {
    const headerSegments = templateHead.text.split(/(\{\{\d+\}\})/);
    let headerIdx = 0;
    for (const seg of headerSegments) {
      const match = seg.match(/^\{\{(\d+)\}\}$/);
      if (match) {
        parts.push({ varIndex: headerIdx, isHeader: true });
        headerIdx++;
      } else if (seg) {
        parts.push(seg);
      }
    }
    parts.push("\n");
  } else if (templateHead?.text) {
    parts.push(templateHead.text + "\n");
  }

  // Render body
  const segments = templateBody.text.split(/(\{\{\d+\}\})/);
  let bodyIdx = 0;
  for (const seg of segments) {
    const match = seg.match(/^\{\{(\d+)\}\}$/);
    if (match) {
      parts.push({ varIndex: bodyIdx, isHeader: false });
      bodyIdx++;
    } else if (seg) {
      parts.push(seg);
    }
  }

  // Render footer if present
  if (templateFoot?.text) {
    parts.push("\n" + templateFoot.text);
  }

  return parts;
}

/**
 * The template message to send — components with the variables' values and
 * a payload per quick-reply button — and its rendered text for display.
 */
export function buildTemplateMessage(
  templateDraft: TemplateData,
  sections: TemplateSections,
  bodyVarValues: string[],
  headVarValues: string[],
): { template: TemplateMessage["template"]; renderedBody: string } {
  const { templateBody, templateHead, templateFoot, templateButtons } =
    sections;
  const { bodyVarCount, headVarCount } = templateVarCounts(sections);

  // Build rendered text
  let bodyContent = templateBody!.text;
  let headContent = templateHead?.text;
  const components: TemplateMessage["template"]["components"] = [];

  if (headVarValues.length && headVarCount > 0) {
    let idx = 1;
    for (const value of headVarValues.slice(0, headVarCount)) {
      headContent = headContent?.replaceAll(`{{${idx}}}`, value);
      idx++;
    }
    components.push({
      type: "header",
      parameters: headVarValues.slice(0, headVarCount).map((text) => ({
        type: "text" as const,
        text,
      })),
    });
  }

  if (bodyVarValues.length && bodyVarCount > 0) {
    let idx = 1;
    for (const value of bodyVarValues.slice(0, bodyVarCount)) {
      bodyContent = bodyContent.replaceAll(`{{${idx}}}`, value);
      idx++;
    }
    components.push({
      type: "body",
      parameters: bodyVarValues.slice(0, bodyVarCount).map((text) => ({
        type: "text" as const,
        text,
      })),
    });
  }

  if (templateButtons?.buttons) {
    let idx = 0;
    for (const button of templateButtons.buttons) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: idx.toString(),
        parameters: [
          {
            type: "payload",
            payload: button.text.toLowerCase().replaceAll(" ", "_"),
          },
        ],
      });
      idx++;
    }
  }

  const template: TemplateMessage["template"] = {
    name: templateDraft.name,
    language: {
      code: templateDraft.language,
      policy: "deterministic" as const,
    },
  };

  if (components.length) {
    template.components = components;
  }

  // Build rendered text for display
  const renderedParts: string[] = [];
  if (headContent) renderedParts.push(`*${headContent}*`);
  renderedParts.push(bodyContent);
  if (templateFoot?.text) renderedParts.push(`_${templateFoot.text}_`);
  const renderedBody = renderedParts.join("\n\n");

  return { template, renderedBody };
}
