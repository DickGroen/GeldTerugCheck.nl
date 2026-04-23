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

    // TRIAGE bepalen welke route (SONNET of HAIKU)
    const triage = await handleTriage(env, base64, mediaType);

    // Analyse genereren
    const analysis = await generateAnalysis(env, {
      fileBase64: base64,
      mediaType,
      route: triage.route
    });

    // Opslaan in KV
    const kvKey = `paid:${Date.now()}:${email}`;
    await env.GTC_QUEUE.put(kvKey, JSON.stringify({
      type: "paid",
      customerName: name,
      customerEmail: email,
      triage,
      analysis,
      stripe_link: stripeLink,
      created_at: new Date().toISOString()
    }));

    // Admin mail
    await sendAdminPaid(env, {
      customerName: name,
      customerEmail: email,
      triage,
      analysis
    });

    return jsonResponse({
      ok: true,
      message: "Je uitgebreide analyse wordt verwerkt en zo snel mogelijk verzonden."
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
