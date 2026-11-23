const allowedKinds = new Set(["demo", "contract"]);
const plans = new Set(["Essencial", "Pro", "Enterprise", "A definir"]);
const periods = new Set(["Manhã", "Tarde", "Indiferente", ""]);
const requests = new Map();
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const respond = (res, status, message) => res.status(status).json({ ok: status < 300, message });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return respond(res, 405, "Método não permitido.");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const origin = String(req.headers.origin || "");
  if (!origin || !host || (() => { try { return new URL(origin).host !== host; } catch { return true; } })()) {
    return respond(res, 403, "Origem não autorizada.");
  }
  const length = Number(req.headers["content-length"] || "0");
  if (length > 12000) return respond(res, 413, "Solicitação muito grande.");
  const ip = String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  if (requests.size > 900) requests.clear();
  const recent = (requests.get(ip) || []).filter(t => now - t < 600000);
  if (recent.length >= 4) return respond(res, 429, "Muitas tentativas. Tente novamente mais tarde.");
  requests.set(ip, [...recent, now]);

  let input = req.body;
  if (typeof input === "string") { try { input = JSON.parse(input); } catch { return respond(res, 400, "Dados inválidos."); } }
  if (!input || typeof input !== "object" || Array.isArray(input)) return respond(res, 400, "Dados inválidos.");
  if (clean(input.website, 300)) return respond(res, 200, "Solicitação recebida.");
  const kind = clean(input.kind, 12);
  const name = clean(input.name, 100);
  const company = clean(input.company, 140);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 35);
  const plan = clean(input.plan, 30) || "A definir";
  const date = clean(input.date, 10);
  const period = clean(input.period, 25);
  const notes = clean(input.notes, 1200);
  if (!allowedKinds.has(kind) || !plans.has(plan) || !periods.has(period) || input.consent !== true
      || name.length < 3 || company.length < 2
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/\D/g, "").length < 10) {
    return respond(res, 400, "Revise os dados obrigatórios e tente novamente.");
  }
  if (kind === "demo" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !period)) {
    return respond(res, 400, "Informe uma data e um período de preferência para a demonstração.");
  }
  if (kind === "demo" && date < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
    return respond(res, 400, "Informe uma data futura para a demonstração.");
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return respond(res, 503, "Canal comercial temporariamente indisponível. Escreva para comercial@sentinelconsig.com.br.");
  const items = [
    ["Tipo", kind === "demo" ? "Pedido de demonstração" : "Solicitação de contratação"],
    ["Nome", name], ["Empresa", company], ["E-mail", email], ["Telefone", phone],
    ["Plano de interesse", plan],
    ["Data preferida", kind === "demo" ? date : "—"],
    ["Período", kind === "demo" ? period : "—"],
    ["Observações", notes || "—"]
  ];
  const subject = (kind === "demo" ? "Demonstração" : "Contratação") + " • Sentinel Consig • " + company;
  const html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#11212D"><h1 style="color:#06141B">Novo contato comercial</h1><p>Pedido recebido pelo website do Sentinel Consig.</p><table style="width:100%;border-collapse:collapse">' + items.map(([label, value]) => '<tr><th style="text-align:left;padding:12px;border-bottom:1px solid #ddd">' + escapeHtml(label) + '</th><td style="padding:12px;border-bottom:1px solid #ddd">' + escapeHtml(value) + '</td></tr>').join("") + '</table><p style="font-size:12px;color:#667">Contato fornecido voluntariamente; utilizar exclusivamente para atendimento comercial.</p></div>';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method:"POST",
      signal: controller.signal,
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sentinel Consig <notificacoes@sentinelconsig.com.br>",
        to: [process.env.LEADS_TO_EMAIL || "comercial@sentinelconsig.com.br"],
        subject,
        html,
        text: "Novo contato comercial Sentinel Consig\n\n" + items.map(([label,value]) => label + ": " + value).join("\n"),
        reply_to: email
      })
    });
    if (!result.ok) {
      console.error("Commercial email delivery failed:", result.status);
      return respond(res, 502, "Não foi possível enviar sua solicitação agora. Entre em contato pelo e-mail comercial@sentinelconsig.com.br.");
    }
    return respond(res, 200, "Recebemos sua solicitação! Nossa equipe entrará em contato para confirmar os próximos passos.");
  } catch (error) {
    console.error("Commercial delivery unavailable:", error?.name || "error");
    return respond(res, 502, "Não foi possível concluir o envio. Utilize comercial@sentinelconsig.com.br.");
  } finally { clearTimeout(timeout); }
}
