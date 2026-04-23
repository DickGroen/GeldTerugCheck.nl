import TRIAGE_PROMPT from '../prompts/triage.js';
import HAIKU_PROMPT from '../prompts/haiku.js';
import SONNET_PROMPT from '../prompts/sonnet.js';

const GRATIS_PROMPT = `
Je bent een analyse‑systeem voor consumentenkwesties in Nederland.

Jouw taak:
Lees het document en maak een korte, gratis eerste inschatting voor de consument.

Focus: Welk bedrag zou de consument mogelijk kunnen terugkrijgen of besparen?

Geef je antwoord ALTIJD exact in deze structuur:

[COMPANY]
Naam van het bedrijf, de leverancier, webshop of dienstverlener
[/COMPANY]

[AMOUNT_CLAIMED]
Geëist totaalbedrag als getal (alleen getal, geen €‑teken)
[/AMOUNT_CLAIMED]

[AMOUNT_RECOVERABLE]
Geschat bedrag dat mogelijk onterecht is of teruggevorderd kan worden (alleen getal, geen €‑teken)
[/AMOUNT_RECOVERABLE]

[RISK]
low of medium of high
[/RISK]

[TEASER]
Schrijf precies 1 zin: noem ALLEEN dat er mogelijk een bedrag kan worden teruggevorderd.
Geen redenen, geen details, geen wetsartikelen.
[/TEASER]
`;

// -----------------------------------------------------------------------------
// Claude API
// -----------------------------------------------------------------------------

async function callClaudeDocument(env, { model, maxTokens, prompt, fileBase64, mediaType }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: mediaType, data: fileBase64 } }
              : { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`AI‑fout: ${JSON.stringify(data)}`);
  return data?.content?.[0]?.text || "";
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mediaType: file.type || "application/pdf" };
}

function safeJsonParse(str) {
  try {
    const match = String(str).match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function validateUploadInput({ file, name, email }) {
  if (!file) return "Geen bestand ontvangen";
  if (!name || !String(name).trim()) return "Naam ontbreekt";
  if (!email || !String(email).includes("@")) return "Ongeldig e‑mailadres";
  return null;
}

function extractTaggedSection(text, tag) {
  const start = `[${tag}]`;
  const end = `[/${tag}]`;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1) return "";
  return text.substring(startIndex + start.length, endIndex).trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// -----------------------------------------------------------------------------
// RTF (NL‑versies)
// -----------------------------------------------------------------------------

function rtfEscape(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par\n")
    .replace(/[^\x00-\x7F]/g, c => `\\u${c.charCodeAt(0)}?`);
}

function rtfToBase64(rtfString) {
  const bytes = new TextEncoder().encode(rtfString);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Analyse RTF
function maakAnalyseRtf(analysis, customerName, customerEmail, triage) {
  const title = extractTaggedSection(analysis, "TITLE") || "Analyse";
  const summary = extractTaggedSection(analysis, "SUMMARY");
  const issues = extractTaggedSection(analysis, "ISSUES");
  const assessment = extractTaggedSection(analysis, "ASSESSMENT");
  const nextSteps = extractTaggedSection(analysis, "NEXT_STEPS");

  const issueLines = String(issues || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const nextLines = String(nextSteps || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  return `{\\rtf1\\ansi
{\\fonttbl{\\f1 Arial;}}
\\f1\\fs22
{\\pard\\fs32\\b ${rtfEscape(title)}\\par}
{\\pard Naam: ${rtfEscape(customerName)} (${rtfEscape(customerEmail)})\\par}
{\\pard Bedrijf: ${rtfEscape(triage?.company || "onbekend")} | Bedrag: ${triage?.amount || "onbekend"} | Risico: ${rtfEscape(triage?.risk)}\\par}

{\\pard\\fs26\\b Samenvatting\\par}
{\\pard ${rtfEscape(summary)}\\par}

{\\pard\\fs26\\b Mogelijke aandachtspunten\\par}
${issueLines}

{\\pard\\fs26\\b Inschatting\\par}
{\\pard ${rtfEscape(assessment)}\\par}

{\\pard\\fs26\\b Volgende stappen\\par}
${nextLines}

{\\pard\\i Dit is een informatieve analyse en geen juridisch advies.\\par}
}`;
}

// Bezwaarbrief RTF
function maakBezwaarRtf(analysis, customerName, triage) {
  const objection = extractTaggedSection(analysis, "OBJECTION");

  return `{\\rtf1\\ansi
{\\fonttbl{\\f1 Arial;}}
\\f1\\fs22
{\\pard\\fs28\\b Bezwaarbrief\\par}
{\\pard Voor: ${rtfEscape(customerName)} | Bedrijf: ${rtfEscape(triage?.company)}\\par}
{\\pard ${rtfEscape(objection)}\\par}
{\\pard\\i Dit is een conceptbrief. Bij twijfel: juridisch advies inwinnen.\\par}
}`;
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

async function handleTriage(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001",
    maxTokens: 800,
    prompt: TRIAGE_PROMPT,
    fileBase64,
    mediaType
  });

  const parsed = safeJsonParse(raw);
  if (!parsed) return { company: null, amount: null, risk: "medium", route: "SONNET" };

  return {
    company: parsed.company || null,
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    risk: parsed.risk || "medium",
    route: parsed.route || "SONNET"
  };
}

async function handleGratis(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001",
    maxTokens: 600,
    prompt: GRATIS_PROMPT,
    fileBase64,
    mediaType
  });

  return {
    company: extractTaggedSection(raw, "COMPANY") || null,
    amount_claimed: parseFloat(extractTaggedSection(raw, "AMOUNT_CLAIMED")) || null,
    amount_recoverable: parseFloat(extractTaggedSection(raw, "AMOUNT_RECOVERABLE")) || null,
    risk: extractTaggedSection(raw, "RISK") || "medium",
    teaser: extractTaggedSection(raw, "TEASER") || null
  };
}

async function generateAnalysis(env, { fileBase64, mediaType, route }) {
  const useSonnet = route === "SONNET";
  const prompt = useSonnet ? SONNET_PROMPT : HAIKU_PROMPT;
  const model = useSonnet ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  return await callClaudeDocument(env, {
    model,
    maxTokens: useSonnet ? 3500 : 1800,
    prompt,
    fileBase64,
    mediaType
  });
}

// -----------------------------------------------------------------------------
// Mailers (NL)
// -----------------------------------------------------------------------------

function buildGratisMailHtml({ name, company, amount_claimed, amount_recoverable, risk, teaser, stripeLink }) {
  const riskLabel = { low: "Laag", medium: "Middel", high: "Hoog" }[risk] || risk;
  const amountClaimed = amount_claimed ? `€ ${amount_claimed.toFixed(2)}` : "onbekend";
  const amountRecoverable = amount_recoverable ? `€ ${amount_recoverable.toFixed(2)}` : null;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1b3a8c;">Je gratis eerste inschatting</h2>
      <p>Hallo ${escapeHtml(name)},</p>
      <p>We hebben je document van <strong>${escapeHtml(company || "onbekend bedrijf")}</strong> geanalyseerd.</p>

      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr><td>Geëist bedrag</td><td>${amountClaimed}</td></tr>
        ${amountRecoverable ? `<tr><td>Mogelijk terug te vorderen</td><td><strong>${amountRecoverable}</strong></td></tr>` : ""}
        <tr><td>Risico‑inschatting</td><td>${riskLabel}</td></tr>
      </table>

      <p style="background:#fef3c7;padding:12px;border-radius:6px;">
        ${escapeHtml(teaser || "Er lijkt mogelijk een bedrag teruggevorderd te kunnen worden.")}
      </p>

      <p>Voor een volledige analyse inclusief kant‑en‑klare brief:</p>
      <a href="${stripeLink}" style="display:inline-block;background:#1b3a8c;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Volledige analyse voor €49 →
      </a>

      <p style="color:#6b7280;font-size:0.85rem;margin-top:24px;">
        Dit is een informatieve eerste inschatting en geen juridisch advies.
      </p>
    </div>
  `;
}

async function sendAdminGratis(env, { name, email, gratis, stripeLink }) {
  const html = buildGratisMailHtml({
    name,
    company: gratis.company,
    amount_claimed: gratis.amount_claimed,
    amount_recoverable: gratis.amount_recoverable,
    risk: gratis.risk,
    teaser: gratis.teaser,
    stripeLink
  });

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "GeldTerugCheck.nl <noreply@geldterugcheck.nl>",
      to: ["dickgroen2@gmail.com"],
      reply_to: [email],
      subject: `Nieuwe gratis aanvraag: ${name} (${email})`,
      html
    })
  });
}

async function sendAdminPaid(env, { customerName, customerEmail, triage, analysis }) {
  const analyseRtf = maakAnalyseRtf(analysis, customerName, customerEmail, triage);
  const bezwaarRtf = maakBezwaarRtf(analysis, customerName, triage);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "GeldTerugCheck.nl <noreply@geldterugcheck.nl>",
      to: ["dickgroen2@gmail.com"],
      reply_to: [customerEmail],
      subject: `Nieuwe betaalde analyse: ${customerName}`,
      html: `<p>Nieuwe analyse ontvangen.</p>`,
      attachments: [
        { filename: "Analyse.rtf", content: rtfToBase64(analyseRtf) },
        { filename: "Bezwaarbrief.rtf", content: rtfToBase64(bezwaarRtf) }
      ]
    })
  });
}

// -----------------------------------------------------------------------------
// Cron
// -----------------------------------------------------------------------------

async function handleCron(env) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const list = await env.GTC_QUEUE.list();

  for (const key of list.keys) {
    try {
      const raw = await env.GTC_QUEUE.get(key.name);
      if (!raw) continue;

      const entry = JSON.parse(raw);
      const createdAt = new Date(entry.created_at).getTime();
      if (now - createdAt < oneDayMs) continue;

      if (entry.type === "paid") {
        await sendAdminPaid(env, entry);
      } else {
        await sendAdminGratis(env, entry);
      }

      await env.GTC_QUEUE.delete(key.name);
    } catch (err) {
      console.error("Cron fout:", err.message);
    }
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    const url = new URL(request.url);

    // TRIAGE
    if (request.method === "POST" && url.pathname === "/analyze") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) return jsonResponse({ ok: false, error: "Geen bestand ontvangen" }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const triage = await handleTriage(env, base64, mediaType);

        return jsonResponse({ ok: true, ...triage });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // GRATIS
    if (request.method === "POST" && url.pathname === "/analyze-free") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");
        const stripeLink = env.STRIPE_LINK || "https://geldterugcheck.nl";

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const gratis = await handleGratis(env, base64, mediaType);

        const kvKey = `gratis:${Date.now()}:${email}`;
        await env.GTC_QUEUE.put(kvKey, JSON.stringify({
          type: "gratis",
          name,
          email,
          ...gratis,
          stripe_link: stripeLink,
          created_at: new Date().toISOString()
        }));

        await sendAdminGratis(env, { name, email, gratis, stripeLink });

        return jsonResponse({
          ok: true,
          message: "Je ontvangt je gratis inschatting uiterlijk de volgende werkdag voor 16:00."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }
    // SUBMIT (betaalde analyse)
    if (request.method === "POST" && url.pathname === "/submit") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");
        const stripeLink = env.STRIPE_LINK || "https://geldterugcheck.nl";

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const result = await handleSonnet(env, base64, mediaType);

        const kvKey = `sonnet:${Date.now()}:${email}`;
        await env.GTC_QUEUE.put(kvKey, JSON.stringify({
          type: "sonnet",
          name,
          email,
          ...result,
          stripe_link: stripeLink,
          created_at: new Date().toISOString()
        }));

        await sendAdminSonnet(env, { name, email, result, stripeLink });

        return jsonResponse({
          ok: true,
          message: "Je uitgebreide analyse wordt verwerkt en zo snel mogelijk verzonden."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // fallback
    return jsonResponse({ ok: false, error: "Endpoint niet gevonden" }, 404);
  }
};

    //
    
