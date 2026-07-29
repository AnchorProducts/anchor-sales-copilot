/* ============================================================================
 * The transactional emails the Pitch to Marketing workflow sends.
 *
 * Marketing owns this copy — it is edited in the Marketing Hub
 * (/marketing/email-templates) and stored in the shared `mkt_email_template`
 * table. What lives here is the CATALOG (which emails exist, when each fires,
 * and which variables it may use) plus the default wording used until marketing
 * saves their own. Deleting a saved template falls back to these defaults.
 *
 * Adding a new variable means adding it here AND supplying it at the call site
 * in src/lib/pitches/notify.ts — the editor lists exactly what is available, so
 * marketing can never reference a variable that will not resolve.
 * ==========================================================================*/

export type TemplateVariable = { name: string; describe: string; sample: string };

export type PitchTemplateDef = {
  key: string;
  label: string;
  /** Who receives it, in plain language. */
  audience: string;
  /** When it fires. */
  trigger: string;
  variables: TemplateVariable[];
  defaults: {
    subject: string;
    heading: string;
    body: string;
    buttonLabel: string;
  };
};

const LINK_VAR: TemplateVariable = {
  name: "link",
  describe: "Deep link to the relevant view (set automatically)",
  sample: "https://anchor-internal.vercel.app/dashboard/pitch",
};

export const PITCH_TEMPLATES: PitchTemplateDef[] = [
  {
    key: "pitch_new",
    label: "New pitch submitted",
    audience: "Marketing team + admins",
    trigger: "Someone submits a new pitch.",
    variables: [
      { name: "title", describe: "The pitch title", sample: "Snow-retention campaign for Northeast contractors" },
      { name: "category", describe: "Category the submitter chose", sample: "Campaign" },
      { name: "submitter", describe: "Who submitted it", sample: "Dana Whitfield" },
      { ...LINK_VAR, sample: "https://anchor-internal.vercel.app/marketing/submissions" },
    ],
    defaults: {
      subject: "New marketing pitch: {{title}}",
      heading: "A new pitch is waiting for review",
      body: "{{submitter}} pitched a marketing idea.\n\n> {{title}}\nCategory: {{category}}\n\nGive it a look when you get a chance — the submitter sees your decision and timeline as soon as you make it.",
      buttonLabel: "Review the pitch",
    },
  },
  {
    key: "pitch_info_response",
    label: "Submitter answered a question",
    audience: "Marketing team + admins",
    trigger: "A submitter replies to an info request.",
    variables: [
      { name: "title", describe: "The pitch title", sample: "Snow-retention campaign for Northeast contractors" },
      { name: "responder", describe: "Who answered", sample: "Dana Whitfield" },
      { name: "message", describe: "What they wrote back", sample: "We have eleven contractors asking for this in Vermont alone." },
      { ...LINK_VAR, sample: "https://anchor-internal.vercel.app/marketing/submissions" },
    ],
    defaults: {
      subject: "Info provided on pitch: {{title}}",
      heading: "You have an answer",
      body: "{{responder}} answered your question on {{title}}.\n\n> {{message}}\n\nThe pitch is back in your queue.",
      buttonLabel: "Open submissions",
    },
  },
  {
    key: "pitch_approved",
    label: "Pitch approved",
    audience: "The submitter",
    trigger: "Marketing approves a pitch.",
    variables: [
      { name: "title", describe: "The pitch title", sample: "Snow-retention campaign for Northeast contractors" },
      { name: "timeline", describe: "The timeline marketing committed to", sample: "Q4 2026" },
      LINK_VAR,
    ],
    defaults: {
      subject: "Your pitch was approved: {{title}}",
      heading: "Marketing is running with your idea",
      body: "Good news — {{title}} was approved and is now on the marketing board.\n\n> Planned timeline: {{timeline}}\n\nThanks for sending it over. You can follow along or add anything else from your pitches.",
      buttonLabel: "View my pitches",
    },
  },
  {
    key: "pitch_declined",
    label: "Pitch declined",
    audience: "The submitter",
    trigger: "Marketing declines a pitch.",
    variables: [
      { name: "title", describe: "The pitch title", sample: "Snow-retention campaign for Northeast contractors" },
      { name: "reason", describe: "Why it was declined", sample: "It overlaps a campaign already booked for the same quarter." },
      LINK_VAR,
    ],
    defaults: {
      subject: "Update on your pitch: {{title}}",
      heading: "Not this one — here's why",
      body: "Marketing reviewed {{title}} and decided not to move forward right now.\n\n> {{reason}}\n\nPlease keep the ideas coming — a no on one pitch says nothing about the next.",
      buttonLabel: "View my pitches",
    },
  },
  {
    key: "pitch_info_request",
    label: "Marketing asked a question",
    audience: "The submitter",
    trigger: "Marketing requests more info on a pitch.",
    variables: [
      { name: "title", describe: "The pitch title", sample: "Snow-retention campaign for Northeast contractors" },
      { name: "question", describe: "What marketing asked", sample: "Roughly how many contractors have asked you for this?" },
      LINK_VAR,
    ],
    defaults: {
      subject: "Question about your pitch: {{title}}",
      heading: "Marketing needs one more thing",
      body: "Before deciding on {{title}}, marketing has a question:\n\n> {{question}}\n\nReply in the app and it goes straight back into their queue.",
      buttonLabel: "Answer the question",
    },
  },
];

export const PITCH_TEMPLATE_KEYS = PITCH_TEMPLATES.map((t) => t.key);

export function templateDef(key: string): PitchTemplateDef | undefined {
  return PITCH_TEMPLATES.find((t) => t.key === key);
}

/** Sample values for the editor's live preview. */
export function sampleVars(def: PitchTemplateDef): Record<string, string> {
  return Object.fromEntries(def.variables.map((v) => [v.name, v.sample]));
}
