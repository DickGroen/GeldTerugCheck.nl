import TRIAGE_PROMPT from '../prompts/triage.js';
import HAIKU_PROMPT from '../prompts/haiku.js';
import SONNET_PROMPT from '../prompts/sonnet.js';

const GRATIS_PROMPT = `Je bent een analyse-systeem voor EU261/2004 vluchtclaims.

Jouw taak:
Lees het document en geef een korte, kostenloze eerste inschatting voor de reiziger.

Focus: Is er mogelijk recht op compensatie op basis van EU261/2004?

Geef je antwoord ALTIJD exact in deze structuur:

[AIRLINE]
Naam van de luchtvaartmaatschappij
[/AIRLINE]

[DISRUPTION_TYPE]
Type verstoring (bijv. Vertraging, Annulering, Instapweigering)
[/DISRUPTION_TYPE]

[CLAIM_AMOUNT]
Mogelijk compensatiebedrag als getal (250, 400 of 600) — alleen het getal, geen €-teken
[/CLAIM_AMOUNT]

[FLIGHT_DATE]
Vluchtdatum (bijv. 15-03-2024) of "onduidelijk"
[/FLIGHT_DATE]

[RISK]
low of medium of high
[/RISK]

[TEASER]
Schrijf precies 1 zin: vermeld ALLEEN dat er mogelijk recht op compensatie bestaat.
Noem GEEN redenen, GEEN artikelen, GEEN details.
[/TEASER]`;

// ── Claude API ────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error(`Claude API fout: ${JSON.stringify(data)}`);
  return data?.content?.[0]?.text || "";
}

// ── Utils ─────────────────────────────────────────────────────────────────────

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
  if (!email || !String(email).includes("@")) return "Ongeldig e-mailadres";
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

// ── RTF ───────────────────────────────────────────────────────────────────────

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

function maakAnalyseRtf(analysis, customerName, customerEmail, triage) {
  const title = extractTaggedSection(analysis, "TITLE") || "Vluchtclaim Analyse";
  const summary = extractTaggedSection(analysis, "SUMMARY");
  const issues = extractTaggedSection(analysis, "ISSUES");
  const assessment = extractTaggedSection(analysis, "ASSESSMENT");
  const nextSteps = extractTaggedSection(analysis, "NEXT_STEPS");

  const issueLines = String(issues || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const nextLines = String(nextSteps || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const claimBedrag = triage?.claim_amount ? `\\u8364?${triage.claim_amount}` : "onbekend";

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs32\\b\\cf1 ${rtfEscape(title)}\\par}
{\\pard\\sb0\\sa100\\f1\\fs20\\cf0 Passagier: ${rtfEscape(customerName || "")} (${rtfEscape(customerEmail || "")})\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Luchtvaartmaatschappij: ${rtfEscape(triage?.airline || "onbekend")} | Verstoring: ${rtfEscape(triage?.disruption_type || "onbekend")} | Mogelijke compensatie: ${claimBedrag} | Risico: ${rtfEscape(triage?.risk || "")}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Samenvatting\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(summary)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Bevindingen\\par}
${issueLines}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Inschatting\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(assessment)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Vervolgstappen\\par}
${nextLines}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Opmerking: Dit is een informatieve analyse en geen juridisch advies. Bij twijfel of complexe situaties raden wij aan een jurist of de Consumentenbond te raadplegen.\\par}
}`;
}

function maakClaimBriefRtf(analysis, customerName, triage) {
  const objection = extractTaggedSection(analysis, "OBJECTION");

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs28\\b\\cf2 Claimbrief EU261/2004\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Opgesteld voor: ${rtfEscape(customerName || "")} | Luchtvaartmaatschappij: ${rtfEscape(triage?.airline || "onbekend")}\\par}
{\\pard\\sb300\\sa200\\f1\\fs22\\cf0 ${rtfEscape(objection)}\\par}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Opmerking: Dit is een conceptbrief en geen juridisch advies. Stuur de brief aangetekend indien mogelijk. VluchtClaim NL is niet aansprakelijk voor de uitkomst van uw claim.\\par}
}`;
}

function maakAdminRtf(analysis, customerName, customerEmail, triage) {
  const title = extractTaggedSection(analysis, "TITLE") || "Vluchtclaim Analyse";
  const summary = extractTaggedSection(analysis, "SUMMARY");
  const issues = extractTaggedSection(analysis, "ISSUES");
  const assessment = extractTaggedSection(analysis, "ASSESSMENT");
  const nextSteps = extractTaggedSection(analysis, "NEXT_STEPS");
  const objection = extractTaggedSection(analysis, "OBJECTION");

  const issueLines = String(issues || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const nextLines = String(nextSteps || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const claimBedrag = triage?.claim_amount ? `\\u8364?${triage.claim_amount}` : "onbekend";

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs32\\b\\cf1 ${rtfEscape(title)}\\par}
{\\pard\\sb0\\sa100\\f1\\fs20\\cf0 Passagier: ${rtfEscape(customerName || "")} (${rtfEscape(customerEmail || "")})\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Maatschappij: ${rtfEscape(triage?.airline || "onbekend")} | Vlucht: ${rtfEscape(triage?.flight_number || "onbekend")} | Datum: ${rtfEscape(triage?.flight_date || "onbekend")} | Vertraging: ${triage?.delay_hours ? triage.delay_hours + " uur" : "onbekend"} | Bedrag: ${claimBedrag} | Risico: ${rtfEscape(triage?.risk || "")}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Samenvatting\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(summary)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Bevindingen\\par}
${issueLines}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Inschatting\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(assessment)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Vervolgstappen\\par}
${nextLines}
{\\pard\\sa200\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b\\cf2 Claimbrief\\par}
{\\pard\\sa200\\f1\\fs22\\cf0 ${rtfEscape(objection)}\\par}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Opmerking: Dit is een informatieve analyse en geen juridisch advies.\\par}
}`;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTriage(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001", maxTokens: 800,
    prompt: TRIAGE_PROMPT, fileBase64, mediaType
  });
  const parsed = safeJsonParse(raw);
  if (!parsed) return { airline: null, flight_number: null, flight_date: null, delay_hours: null, disruption_type: null, claim_amount: null, risk: "medium", route: "SONNET" };
  return {
    airline: parsed.airline || null,
    flight_number: parsed.flight_number || null,
    flight_date: parsed.flight_date || null,
    delay_hours: typeof parsed.delay_hours === "number" ? parsed.delay_hours : null,
    disruption_type: parsed.disruption_type || null,
    claim_amount: typeof parsed.claim_amount === "number" ? parsed.claim_amount : null,
    risk: parsed.risk || "medium",
    route: parsed.route || "SONNET"
  };
}

async function handleGratisAnalyse(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001", maxTokens: 600,
    prompt: GRATIS_PROMPT, fileBase64, mediaType
  });
  return {
    airline: extractTaggedSection(raw, "AIRLINE") || null,
    disruption_type: extractTaggedSection(raw, "DISRUPTION_TYPE") || null,
    claim_amount: parseFloat(extractTaggedSection(raw, "CLAIM_AMOUNT")) || null,
    flight_date: extractTaggedSection(raw, "FLIGHT_DATE") || null,
    risk: extractTaggedSection(raw, "RISK") || "medium",
    teaser: extractTaggedSection(raw, "TEASER") || null
  };
}

async function generateAnalysis(env, { fileBase64, mediaType, route }) {
  const useSonnet = route === "SONNET";
  const prompt = useSonnet ? SONNET_PROMPT : HAIKU_PROMPT;
  const model = useSonnet ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const raw = await callClaudeDocument(env, {
    model, maxTokens: useSonnet ? 3500 : 1800, prompt, fileBase64, mediaType
  });
  return raw || "";
}

// ── Mail HTML helpers ─────────────────────────────────────────────────────────

function buildGratisMailHtml({ name, airline, disruption_type, claim_amount, flight_date, risk, teaser, stripeLink }) {
  const riskLabel = { low: "Laag", medium: "Middel", high: "Hoog" }[risk] || risk;
  const claimStr = claim_amount ? `€ ${claim_amount}` : "onbekend";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1d3a6e;">Jouw gratis eerste inschatting</h2>
      <p>Hoi ${escapeHtml(name)},</p>
      <p>We hebben jouw vluchtdocument geanalyseerd op basis van EU-verordening 261/2004.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;">
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Luchtvaartmaatschappij</td>
          <td style="padding:10px 14px;">${escapeHtml(airline || "onbekend")}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:bold;">Type verstoring</td>
          <td style="padding:10px 14px;">${escapeHtml(disruption_type || "onbekend")}</td>
        </tr>
        ${flight_date && flight_date !== "onduidelijk" ? `
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Vluchtdatum</td>
          <td style="padding:10px 14px;">${escapeHtml(flight_date)}</td>
        </tr>` : ""}
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Mogelijk compensatiebedrag</td>
          <td style="padding:10px 14px;font-weight:bold;color:#1d3a6e;">${claimStr}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:bold;">Kans inschatting</td>
          <td style="padding:10px 14px;">${riskLabel}</td>
        </tr>
      </table>
      <p style="background:#fef9c3;border-left:4px solid #eab308;padding:12px 16px;border-radius:4px;">
        ${escapeHtml(teaser || "Op basis van uw vluchtgegevens lijkt er mogelijk recht op compensatie te bestaan.")}
      </p>
      <p>Voor een volledige analyse met kant-en-klare claimbrief:</p>
      <a href="${stripeLink}" style="display:inline-block;background:#1d3a6e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:8px 0;">
        Volledige analyse voor €29 →
      </a>
      <p style="color:#6b7280;font-size:0.85rem;margin-top:32px;">
        Opmerking: Dit is een informatieve eerste inschatting en geen juridisch advies.
        Bij complexe situaties raden wij aan een jurist of de Consumentenbond te raadplegen.
      </p>
    </div>
  `;
}

// ── Mailers ───────────────────────────────────────────────────────────────────

async function sendAdminGratisNotification(env, { name, email, gratis, stripeLink }) {
  const html = buildGratisMailHtml({ name, ...gratis, stripeLink });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VluchtClaim NL <noreply@vluchtclaimnl.nl>",
      to: [env.ADMIN_EMAIL || "admin@vluchtclaimnl.nl"],
      reply_to: [email],
      subject: `Nieuwe gratis aanvraag: ${name} (${email})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <p style="background:#f3f4f6;padding:10px 14px;border-radius:6px;font-size:0.85rem;color:#6b7280;">
            📬 Klantmail wordt morgen om 15:00 verstuurd naar <strong>${escapeHtml(email)}</strong>
          </p>
          ${html}
        </div>
      `
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Admin-notificatie mislukt: ${err}`); }
}

async function sendAdminPaidNotification(env, { customerName, customerEmail, triage, analysis }) {
  const rtfContent = maakAdminRtf(analysis, customerName, customerEmail, triage);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VluchtClaim NL <noreply@vluchtclaimnl.nl>",
      to: [env.ADMIN_EMAIL || "admin@vluchtclaimnl.nl"],
      reply_to: [customerEmail],
      subject: `Nieuwe betaalde analyse: ${customerName || "Onbekend"} (${customerEmail})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">
          <p style="background:#f3f4f6;padding:10px 14px;border-radius:6px;font-size:0.85rem;color:#6b7280;">
            📬 Klantmail (2 bijlagen) wordt morgen om 15:00 verstuurd naar <strong>${escapeHtml(customerEmail)}</strong>
          </p>
          <h2>Nieuwe betaalde vluchtclaim analyse</h2>
          <p><strong>Naam:</strong> ${escapeHtml(customerName || "")}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(customerEmail || "")}</p>
          <p><strong>Maatschappij:</strong> ${escapeHtml(triage?.airline || "onbekend")}</p>
          <p><strong>Vluchtnummer:</strong> ${escapeHtml(triage?.flight_number || "onbekend")}</p>
          <p><strong>Datum:</strong> ${escapeHtml(triage?.flight_date || "onbekend")}</p>
          <p><strong>Vertraging:</strong> ${triage?.delay_hours ? triage.delay_hours + " uur" : "onbekend"}</p>
          <p><strong>Mogelijk bedrag:</strong> ${triage?.claim_amount ? `€ ${triage.claim_amount}` : "onbekend"}</p>
          <p><strong>Risico:</strong> ${escapeHtml(triage?.risk || "")}</p>
          <p style="color:#6b7280;font-size:0.9rem;">Volledige analyse als RTF-bijlage toegevoegd.</p>
        </div>
      `,
      attachments: [{ filename: "Vluchtclaim-Analyse.rtf", content: rtfToBase64(rtfContent) }]
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Admin-mail mislukt: ${err}`); }
}

async function sendDelayedGratisEmail(env, entry) {
  const html = buildGratisMailHtml({
    name: entry.name,
    airline: entry.airline,
    disruption_type: entry.disruption_type,
    claim_amount: entry.claim_amount,
    flight_date: entry.flight_date,
    risk: entry.risk,
    teaser: entry.teaser,
    stripeLink: entry.stripe_link || "https://vluchtclaimnl.nl"
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VluchtClaim NL <noreply@vluchtclaimnl.nl>",
      to: [entry.email],
      subject: "Jouw gratis vluchtclaim inschatting — VluchtClaim NL",
      html
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Gratis mail mislukt: ${err}`); }
}

async function sendDelayedPaidEmail(env, entry) {
  const analyseRtf = maakAnalyseRtf(entry.analysis, entry.name, entry.email, entry.triage);
  const claimBriefRtf = maakClaimBriefRtf(entry.analysis, entry.name, entry.triage);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VluchtClaim NL <noreply@vluchtclaimnl.nl>",
      to: [entry.email],
      subject: "Jouw volledige vluchtclaim analyse — VluchtClaim NL",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
          <h2 style="color:#1d3a6e;">Jouw volledige analyse is klaar</h2>
          <p>Hoi ${escapeHtml(entry.name)},</p>
          <p>In de bijlage vind je twee bestanden:</p>
          <ul style="line-height:1.9;">
            <li><strong>Vluchtclaim-Analyse.rtf</strong> — volledige analyse met alle bevindingen, inschatting en vervolgstappen</li>
            <li><strong>Claimbrief.rtf</strong> — kant-en-klare claimbrief op basis van EU261/2004, direct te gebruiken</li>
          </ul>
          <p>Luchtvaartmaatschappij: <strong>${escapeHtml(entry.triage?.airline || "onbekend")}</strong></p>
          ${entry.triage?.claim_amount ? `<p>Mogelijk compensatiebedrag: <strong>€ ${entry.triage.claim_amount}</strong></p>` : ""}
          ${entry.triage?.flight_date ? `<p>Vluchtdatum: <strong>${escapeHtml(entry.triage.flight_date)}</strong></p>` : ""}
          <p style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:4px;font-size:0.9rem;">
            💡 Tip: Stuur de claimbrief aangetekend om bewijs van ontvangst te hebben.
            Bij uitblijven van reactie kun je de claim escaleren via de ACM ConsuWijzer of een rechter.
          </p>
          <p style="color:#6b7280;font-size:0.85rem;margin-top:32px;">
            Opmerking: Dit is een informatieve analyse en geen juridisch advies.
            Stuur de claimbrief aangetekend indien een schriftelijke vorm vereist is.
          </p>
        </div>
      `,
      attachments: [
        { filename: "Vluchtclaim-Analyse.rtf", content: rtfToBase64(analyseRtf) },
        { filename: "Claimbrief.rtf", content: rtfToBase64(claimBriefRtf) }
      ]
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Betaalde mail mislukt: ${err}`); }
}

// ── Cron handler ──────────────────────────────────────────────────────────────

async function handleCron(env) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const list = await env.VLUCHT_QUEUE.list();

  for (const key of list.keys) {
    try {
      const raw = await env.VLUCHT_QUEUE.get(key.name);
      if (!raw) continue;
      const entry = JSON.parse(raw);
      const createdAt = new Date(entry.created_at).getTime();
      if (now - createdAt < oneDayMs) continue;
      if (entry.type === "paid") {
        await sendDelayedPaidEmail(env, entry);
      } else {
        await sendDelayedGratisEmail(env, entry);
      }
      await env.VLUCHT_QUEUE.delete(key.name);
    } catch (err) {
      console.error(`Cron fout voor ${key.name}:`, err.message);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

    if (request.method === "POST" && url.pathname === "/analyze-free") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");
        const stripeLink = env.STRIPE_LINK || "https://vluchtclaimnl.nl";

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const gratis = await handleGratisAnalyse(env, base64, mediaType);

        const kvKey = `gratis:${Date.now()}:${email}`;
        await env.VLUCHT_QUEUE.put(kvKey, JSON.stringify({
          type: "gratis",
          name, email,
          airline: gratis.airline || "",
          disruption_type: gratis.disruption_type || "",
          claim_amount: gratis.claim_amount || null,
          flight_date: gratis.flight_date || "",
          risk: gratis.risk || "medium",
          teaser: gratis.teaser || "",
          stripe_link: stripeLink,
          created_at: new Date().toISOString()
        }));

        try { await sendAdminGratisNotification(env, { name, email, gratis, stripeLink }); } catch (_) {}

        return jsonResponse({
          ok: true,
          message: "Je ontvangt jouw inschatting uiterlijk de volgende werkdag voor 16:00 uur per e-mail."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/submit") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const triage = await handleTriage(env, base64, mediaType);
        const analysis = await generateAnalysis(env, { fileBase64: base64, mediaType, route: triage.route });

        const kvKey = `paid:${Date.now()}:${email}`;
        await env.VLUCHT_QUEUE.put(kvKey, JSON.stringify({
          type: "paid",
          name, email,
          analysis,
          triage,
          created_at: new Date().toISOString()
        }));

        await sendAdminPaidNotification(env, { customerName: name, customerEmail: email, triage, analysis });

        return jsonResponse({
          ok: true,
          message: "Upload gelukt. Je ontvangt jouw volledige analyse uiterlijk de volgende werkdag voor 16:00 uur per e-mail."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  }
};
