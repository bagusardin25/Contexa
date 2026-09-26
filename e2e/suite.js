// Error-path and feature suite for the live pipeline in Chromium (see docs/HANDOFF.md §4).
// Real Next.js + real FastAPI + fake AssemblyAI (token, streaming WS, LLM Gateway).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SP = __dirname;
const FAKE = "http://127.0.0.1:8100";
const APP = "http://localhost:3000/session";
const QUESTION = "How does your application handle concurrent updates";
const only = process.argv.slice(2);
// Who the API calls for translations and answers (servers.sh reads the same variable).
const LLM_MODE = process.env.LLM_MODE || "assemblyai";
const MODES = {
  assemblyai: { name: "The AssemblyAI LLM Gateway", label: "the AssemblyAI LLM Gateway", fast: "claude-haiku-4-5", main: "claude-sonnet-4-6", auth: "fake-k" },
  openrouter: { name: "OpenRouter", label: "OpenRouter", fast: "vendor/small:free", main: "vendor/big:free", auth: "Bearer" },
  groq: { name: "Groq", label: "Groq", fast: "openai/gpt-oss-20b", main: "openai/gpt-oss-120b", auth: "Bearer" },
};
const MODE = MODES[LLM_MODE];
const PROVIDER = MODE.name;

const results = [];
// Through bash, so it also runs on Windows (Git Bash); `env` adds EMBEDDINGS=on and the like.
const servers = (action, name, env = {}) =>
  execSync(`bash "${SP.replace(/\\/g, "/")}/servers.sh" ${action} ${name}`, {
    stdio: "ignore",
    env: { ...process.env, ...env },
  });
// After a pause (say, an API restart), uvicorn may close the kept-alive socket just as
// the next request reuses it: retry once, and name the cause if that fails too.
async function fakeFetch(pathname, init) {
  try {
    return await fetch(`${FAKE}${pathname}`, init);
  } catch {
    try {
      return await fetch(`${FAKE}${pathname}`, init);
    } catch (error) {
      throw new Error(`${pathname}: ${error.message} (${error.cause?.code ?? error.cause?.message ?? "no cause"})`);
    }
  }
}
const control = (pathname) => fakeFetch(pathname, { method: "POST" });
const fakeLog = async () => (await fakeFetch("/__control/log")).json();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openSession(browser, { grantMic = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  if (grantMic) await context.grantPermissions(["microphone"], { origin: "http://localhost:3000" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  await page.goto(APP);
  await page.getByRole("heading", { name: "Set up your conversation copilot" }).waitFor();
  return { context, page, problems };
}

const status = (page, label) => page.getByRole("status").filter({ hasText: new RegExp(`^${label}$`) });
const transcript = (page) => page.getByRole("log", { name: "Transcript" });

async function chooseMicAndStart(page) {
  await page.locator('label:has-text("Microphone")').first().click();
  await page.getByRole("button", { name: /Start listening|Try again/ }).click();
}

async function upload(page, name, content) {
  const file = path.join(SP, name);
  fs.writeFileSync(file, content);
  await page.locator('input[type="file"]').setInputFiles(file);
}

async function addLink(page, url) {
  await page.getByRole("textbox", { name: "Document link" }).fill(url);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

const documentItem = (page, name) => page.locator('ul[aria-label="Attached documents"] li').filter({ hasText: name });

async function scenario(name, fn) {
  if (only.length && !only.some((key) => name.includes(key))) return;
  const started = Date.now();
  try {
    const notes = await fn();
    results.push({ name, ok: true, notes });
    console.log(`PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)${notes ? ` · ${notes}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, notes: error.message });
    console.log(`FAIL ${name}: ${error.message.split("\n")[0]}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });

  await scenario("01 happy path with one-click sample docs, export", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    const banner = await page.getByText("Connected to the Contexa API").innerText();
    const expected = `translations on ${MODE.fast}, answers on ${MODE.main} via ${MODE.label}`;
    assert(banner.includes("speech on AssemblyAI") && banner.includes(expected), `banner: ${banner}`);
    await page.getByRole("button", { name: "Load sample project docs" }).click();
    await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
    const samples = await page.getByText("Sample", { exact: true }).count();
    assert(samples === 2, `expected 2 Sample badges, got ${samples}`);
    await page.getByText(/terms? from your documents help AssemblyAI/).waitFor();
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    const evidence = await page.getByRole("complementary", { name: "Response copilot" }).innerText();
    assert(evidence.includes("notewave-architecture.md"), "answer should cite notewave-architecture.md");
    assert(evidence.includes("Conflict handling"), "evidence should point at the Conflict handling section");
    await page.screenshot({ path: path.join(SP, "suite-01-live.png") });
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText("Session ended").waitFor({ timeout: 10000 });
    const recap = page.getByRole("region", { name: "Recap" });
    await recap.getByText("Tim membahas cara Notewave menangani pembaruan bersamaan", { exact: false }).waitFor({ timeout: 15000 });
    const recapText = await recap.innerText();
    assert(recapText.includes("Speaker B: kirim dokumen arsitektur lengkap"), `recap: ${recapText}`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export .md" }).last().click(),
    ]);
    const exported = fs.readFileSync(await download.path(), "utf8");
    assert(exported.includes(QUESTION), "export should contain the question");
    assert(exported.includes("optimistic locking"), "export should contain the answer");
    assert(exported.includes("## Recap") && exported.includes("### Action items"), "export should contain the recap");
    const log = await fakeLog();
    const query = log.connections.at(-1).query;
    const terms = JSON.parse(query.keyterms_prompt);
    assert(terms.includes("Notewave") || terms.includes("Supabase Realtime"), `keyterms: ${query.keyterms_prompt}`);
    // Who got the LLM calls, and how.
    assert(log.recap_user.includes("(question) How does your application handle concurrent updates"), `recap prompt: ${log.recap_user}`);
    const calls = log.llm.map((c) => `${c.name}:${c.model}:${c.format}:${c.auth}`);
    const analysis = log.llm.find((c) => c.name === "turn_analysis");
    const answer = log.llm.find((c) => c.name === "grounded_answer");
    const recapCall = log.llm.find((c) => c.name === "session_recap");
    assert(analysis && answer && recapCall, `llm calls: ${calls.join(", ")}`);
    assert(recapCall.model === MODE.main, `recap model ${recapCall.model}`);
    assert(analysis.model === MODE.fast, `analysis model ${analysis.model}`);
    assert(answer.model === MODE.main, `answer model ${answer.model}`);
    assert(log.llm.every((c) => c.format === "json_schema"), `formats: ${calls.join(", ")}`);
    assert(log.llm.every((c) => c.auth === MODE.auth), `auth: ${calls.join(", ")}`);
    const routed = LLM_MODE === "openrouter";
    assert(log.llm.every((c) => (c.provider?.require_parameters === true) === routed), "require_parameters is for OpenRouter only");
    // LLM_REASONING_EFFORT=low is set for openrouter and groq; only Groq may receive it.
    const effort = LLM_MODE === "groq" ? "low" : null;
    assert(log.llm.every((c) => c.reasoning_effort === effort && !c.reasoning), `reasoning: ${JSON.stringify(log.llm.map((c) => [c.reasoning_effort, c.reasoning]))}`);
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return `keyterms sent: ${terms.length} (${terms.slice(0, 5).join(", ")}…), export ${exported.length} chars, llm: ${[...new Set(calls)].join(", ")}`;
  });

  await scenario("02 LLM refused (free plan): transcript keeps going, retry recovers", async () => {
    await control("/__control/reset");
    await control("/__control/llm?mode=fail");
    const { context, page } = await openSession(browser);
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByText(`Translation failed. ${PROVIDER} returned HTTP 403: LLM Gateway is not available on the free plan`, { exact: false }).first().waitFor({ timeout: 20000 });
    await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
    await page.getByText("Couldn't generate an answer").waitFor({ timeout: 20000 });
    const copilot = await page.getByRole("complementary", { name: "Response copilot" }).innerText();
    assert(copilot.includes("free plan"), "copilot error should carry the gateway's reason");
    await page.screenshot({ path: path.join(SP, "suite-02-llm-fail.png") });
    await control("/__control/llm?mode=ok");
    await page.getByRole("button", { name: "Retry" }).first().click();
    await page.getByText("Selamat datang kembali", { exact: false }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText("Session ended").waitFor({ timeout: 10000 });
    await context.close();
  });

  await scenario("03 API down: banner, upload error, start error; recovery after restart", async () => {
    servers("stop", "api");
    const { context, page } = await openSession(browser);
    await page.getByText("Can't reach the Contexa API").waitFor({ timeout: 10000 });
    await upload(page, "offline.md", "# Offline\n\nSupabase Realtime and WebSocket notes.\n");
    await page.getByText(/Couldn't reach the Contexa API at http:\/\/localhost:8000/).first().waitFor({ timeout: 10000 });
    await chooseMicAndStart(page);
    await page.getByRole("alert").filter({ hasText: "Couldn't start the session" }).waitFor({ timeout: 15000 });
    const startError = await page.getByRole("alert").filter({ hasText: "Couldn't start the session" }).innerText();
    assert(startError.includes("Couldn't reach the Contexa API"), `start error: ${startError}`);
    await page.screenshot({ path: path.join(SP, "suite-03-api-down.png") });
    const retrying = await page.getByText("Retrying automatically", { exact: false }).count();
    assert(retrying === 1, "the unreachable banner should say it keeps retrying");
    servers("start", "api");
    // No click: the banner re-checks on its own.
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await context.close();
  });

  await scenario("04 API restarted after upload: session recreated, documents re-uploaded", async () => {
    await control("/__control/reset");
    const { context, page } = await openSession(browser);
    await upload(page, "conflicts.md", "# Conflicts\n\n## Conflict handling\n\nEach note row carries a version column and writes use optimistic locking with Supabase.\n");
    await page.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    servers("start", "api"); // restart: the in-memory session is gone
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 25000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 25000 });
    const copilot = await page.getByRole("complementary", { name: "Response copilot" }).innerText();
    assert(copilot.includes("conflicts.md"), "the re-uploaded document should be cited");
    await page.getByRole("button", { name: "Stop session" }).click();
    await context.close();
  });

  await scenario("05 no AssemblyAI key: warning banner and a clear start error", async () => {
    servers("start", "api-nokey");
    const { context, page } = await openSession(browser);
    await page.getByText("The API has no AssemblyAI key").waitFor({ timeout: 10000 });
    await upload(page, "nokey.md", "# Notes\n\nFastAPI and Next.js.\n");
    await page.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    await chooseMicAndStart(page);
    const alert = page.getByRole("alert").filter({ hasText: "Couldn't start the session" });
    await alert.waitFor({ timeout: 15000 });
    const text = await alert.innerText();
    assert(text.includes("ASSEMBLYAI_API_KEY is not configured on the server."), text);
    await context.close();
    servers("start", "api");
  });

  await scenario("06 AssemblyAI rejects the stream: reason shown, Try again works", async () => {
    await control("/__control/reset");
    await control("/__control/reject?count=1");
    const { context, page } = await openSession(browser);
    await chooseMicAndStart(page);
    const alert = page.getByRole("alert").filter({ hasText: "Couldn't start the session" });
    await alert.waitFor({ timeout: 15000 });
    const text = await alert.innerText();
    assert(text.includes("Invalid parameter: speech_model"), text);
    await page.getByRole("button", { name: "Try again" }).click();
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await context.close();
    return text.split("\n").at(-1);
  });

  await scenario("07 microphone permission denied (user clicks Block)", async () => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    // What the browser does when the user blocks the prompt.
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    const page = await context.newPage();
    await page.goto(APP);
    await chooseMicAndStart(page);
    const alert = page.getByRole("alert").filter({ hasText: "Permission denied" });
    await alert.waitFor({ timeout: 15000 });
    const text = await alert.innerText();
    assert(text.includes("Microphone access was blocked"), text);
    const retry = await page.getByRole("button", { name: "Try again" }).isEnabled();
    assert(retry, "Try again should be available");
    await context.close();
  });

  await scenario("08 tab shared without audio, and picker cancelled", async () => {
    const notes = [];
    for (const [label, script] of [
      [
        "tab without audio",
        () => {
          navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement("canvas");
            return canvas.captureStream(1); // video only, like a tab shared without "Share tab audio"
          };
        },
      ],
      [
        "picker cancelled",
        () => {
          navigator.mediaDevices.getDisplayMedia = () =>
            Promise.reject(new DOMException("Permission denied by user", "NotAllowedError"));
        },
      ],
    ]) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      await context.addInitScript(script);
      const page = await context.newPage();
      await page.goto(APP);
      await page.getByRole("button", { name: "Start listening" }).click();
      const alert = page.getByRole("alert").filter({ hasText: /No audio in the shared tab|Permission denied/ });
      await alert.waitFor({ timeout: 15000 });
      const text = (await alert.innerText()).replace(/\n+/g, " · ");
      if (label === "tab without audio") assert(text.includes("Share tab audio"), text);
      else assert(text.includes("Screen sharing was blocked or cancelled"), text);
      notes.push(`${label}: ${text}`);
      await context.close();
    }
    return notes.join(" || ");
  });

  await scenario("09 per-language stream parameters", async () => {
    await control("/__control/reset");
    const { context, page } = await openSession(browser);
    await upload(page, "terms.md", "# Terms\n\nWe use FastAPI, PostgreSQL, and Supabase Realtime.\n");
    await page.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    // Japanese, speaker labels off.
    await page.getByRole("combobox", { name: "Speakers talk in" }).click();
    await page.getByRole("option", { name: /Japanese/ }).click();
    await page.getByRole("switch", { name: "Label speakers" }).click();
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await transcript(page).locator("article").first().waitFor({ timeout: 20000 });
    const firstTurn = await transcript(page).locator("article").first().innerText();
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText("Session ended").waitFor({ timeout: 10000 });
    let log = await fakeLog();
    const ja = log.connections.at(-1).query;
    assert(ja.speech_model === "universal-3-5-pro", `ja model ${ja.speech_model}`);
    assert(!("speaker_labels" in ja), "speaker_labels should be off");
    assert(!("format_turns" in ja), "no format_turns for Universal-3.5 Pro");
    assert(!/^Speaker [A-Z]/.test(firstTurn), `speaker label shown while off: ${firstTurn.slice(0, 40)}`);
    // Indonesian speech → whisper-rt, no keyterms.
    await page.getByRole("button", { name: "New session" }).first().click();
    await page.getByRole("combobox", { name: "Speakers talk in" }).click();
    await page.getByRole("option", { name: /Indonesian/ }).click();
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText(/Session ended|No speech was captured/).first().waitFor({ timeout: 10000 });
    log = await fakeLog();
    const id = log.connections.at(-1).query;
    assert(id.speech_model === "whisper-rt", `id model ${id.speech_model}`);
    assert(id.format_turns === "true" && !("keyterms_prompt" in id), JSON.stringify(id));
    await context.close();
    return `ja: ${JSON.stringify(ja)} | id: ${JSON.stringify(id)}`;
  });

  await scenario("10 remove a document mid-session: keyterms shrink live", async () => {
    await control("/__control/reset");
    const { context, page } = await openSession(browser);
    await upload(page, "a.md", "# A\n\nWe deploy with Kubernetes and Terraform on Hetzner.\n");
    await page.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    await upload(page, "b.md", "# B\n\nThe mobile app uses Flutter and Firebase.\n");
    await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    const before = await page.getByRole("button", { name: /\d+ keyterms?/ }).innerText();
    const item = page.locator('ul[aria-label="Attached documents"] li').filter({ hasText: "b.md" });
    await item.hover();
    await item.getByRole("button", { name: "Remove b.md" }).click();
    await page.waitForFunction((prev) => {
      const button = [...document.querySelectorAll("button")].find((b) => /\d+ keyterms?$/.test(b.textContent ?? ""));
      return button && button.textContent !== prev;
    }, before, { timeout: 10000 });
    const after = await page.getByRole("button", { name: /\d+ keyterms?/ }).innerText();
    const log = await fakeLog();
    const updates = log.connections.at(-1).updates;
    assert(updates.length >= 1, "an UpdateConfiguration should have been sent");
    const last = updates.at(-1).keyterms_prompt;
    assert(!last.includes("Flutter") && last.includes("Kubernetes"), JSON.stringify(last));
    await page.getByRole("button", { name: "Stop session" }).click();
    await context.close();
    return `${before} → ${after}; UpdateConfiguration ${JSON.stringify(last)}`;
  });

  await scenario("11 bad files: client rejects .exe, server rejects fake PDF with a reason", async () => {
    const { context, page } = await openSession(browser);
    await upload(page, "setup.exe", "MZ");
    await page.getByText("Only PDF, DOCX, Markdown, and TXT files are supported.").waitFor({ timeout: 5000 });
    await upload(page, "fake.pdf", "this is not a pdf");
    await page.getByText("This file doesn't look like a valid PDF.").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByText("This file doesn't look like a valid PDF.").waitFor({ timeout: 10000 });
    await context.close();
  });

  await scenario("12 cancel while connecting: back to setup, stream not left open", async () => {
    await control("/__control/reset");
    await control("/__control/slow_token?seconds=3");
    const { context, page } = await openSession(browser);
    await page.locator('label:has-text("Microphone")').first().click();
    await page.getByRole("button", { name: "Start listening" }).click();
    await page.getByRole("button", { name: /Connecting to AssemblyAI/ }).waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Start listening" }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(4000); // past the token delay: a late token must not open a stream
    const log = await fakeLog();
    assert(log.connections.length === 0, `a stream was opened after Cancel: ${JSON.stringify(log.connections)}`);
    const pill = await page.getByRole("status").filter({ hasText: /^Ready$/ }).count();
    assert(pill === 1, "status should be back to Ready");
    await control("/__control/slow_token?seconds=0");
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await context.close();
    return "cancelled during token request; no stream opened; restart works";
  });

  await scenario("13 leaving the page ends the stream", async () => {
    await control("/__control/reset");
    const { context, page } = await openSession(browser);
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(2000);
    const log = await fakeLog();
    const last = log.connections.at(-1);
    assert(last.closed_by !== null, "the AssemblyAI socket should be closed after leaving");
    await context.close();
    return `closed_by: ${last.closed_by}`;
  });

  await scenario("14 AssemblyAI drop mid-session: reconnects, no duplicate ids, manual answer, new session resets", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    await page.getByRole("button", { name: "Load sample project docs" }).click();
    await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
    await control("/__control/drop");
    await status(page, "Reconnecting").waitFor({ timeout: 10000 });
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('[role="log"] article').length >= 4, null, { timeout: 20000 });
    // The second connection restarts turn_order at 0; the new turns must not be dropped as duplicates.
    const questions = await transcript(page).getByText(QUESTION, { exact: false }).count();
    assert(questions === 2, `expected the question twice (one per connection), got ${questions}`);
    await page.getByText(/Question · \d+%/).nth(1).waitFor({ timeout: 15000 });
    const first = transcript(page).locator("article").first();
    await first.hover();
    await first.getByRole("button", { name: "Generate answer" }).click();
    await page.getByText("Manual request").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText("Session ended").waitFor({ timeout: 10000 });
    const summary = await page.getByText("Session ended").locator("xpath=ancestor::section[1]").innerText();
    await page.getByRole("button", { name: "New session" }).first().click();
    await page.getByRole("heading", { name: "Set up your conversation copilot" }).waitFor();
    const docs = await page.locator('ul[aria-label="Attached documents"] li').count();
    assert(docs === 2, `documents after New session: ${docs}`);
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    const turns = await transcript(page).locator("article").count();
    await page.getByRole("button", { name: "Stop session" }).click();
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return `summary: ${summary.replace(/\n+/g, " ").slice(0, 120)}… | new session turns: ${turns}`;
  });

  await scenario("15 API restart mid-session (--reload): old turns still answerable, new turns processed", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    await page.getByRole("button", { name: "Load sample project docs" }).click();
    await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    servers("start", "api"); // the server forgets the session, like uvicorn --reload
    // The relay notices, recreates the session, and re-uploads the documents.
    await page.waitForTimeout(4000);
    const first = transcript(page).locator("article").first();
    await first.hover();
    await first.getByRole("button", { name: "Generate answer" }).click();
    await page.getByText("Manual request").first().waitFor({ timeout: 20000 });
    await page.getByRole("complementary", { name: "Response copilot" }).getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    // New speech after the restart is translated by the new server session.
    await control("/__control/drop");
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('[role="log"] article').length >= 3, null, { timeout: 20000 });
    await transcript(page).locator("article").nth(2).getByText("Selamat datang kembali", { exact: false }).waitFor({ timeout: 20000 });
    const docs = await page.getByText(/Ready · \d+ chunks?/).count();
    assert(docs === 2, `documents ready after restart: ${docs}`);
    await page.getByRole("button", { name: "Stop session" }).click();
    // Let the recap finish, so its LLM call doesn't land in the next scenario's log.
    await page.getByRole("region", { name: "Recap" }).getByText("Tim membahas", { exact: false }).waitFor({ timeout: 15000 });
    // The browser logs the expected network failures while the API restarts
    // (refused connections, the old session's 403/404); only script errors count.
    const unexpected = problems.filter(
      (p) => !/ERR_CONNECTION_REFUSED|WebSocket connection to|status of 40[34]/.test(p),
    );
    assert(unexpected.length === 0, unexpected.join("; "));
    await context.close();
    return `${problems.length} expected network log lines during the restart, no script errors`;
  });

  await scenario("16 LLM not configured: setup warning, transcript works, reason on every turn", async () => {
    await control("/__control/reset");
    servers("start", "api-nollm");
    try {
      const { context, page, problems } = await openSession(browser);
      const warning = page.getByRole("alert").filter({ hasText: "Translations and answers aren't set up" });
      await warning.waitFor({ timeout: 10000 });
      const text = await warning.innerText();
      assert(text.includes("LLM_API_KEY is not configured on the server.") && text.includes("LLM_MODEL"), text);
      await chooseMicAndStart(page);
      await status(page, "Live").waitFor({ timeout: 20000 });
      await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
      await page.getByText("Translation failed. LLM_API_KEY is not configured on the server.").first().waitFor({ timeout: 20000 });
      // The heuristic still spots the question; the answer fails with the same reason.
      await page.getByText("Couldn't generate an answer").waitFor({ timeout: 20000 });
      const copilot = await page.getByRole("complementary", { name: "Response copilot" }).innerText();
      assert(copilot.includes("LLM_API_KEY is not configured on the server."), copilot);
      await page.getByRole("button", { name: "Stop session" }).click();
      const log = await fakeLog();
      assert(log.llm.length === 0, `a misconfigured LLM must not be called: ${JSON.stringify(log.llm)}`);
      // The recap reports the same reason (503); the browser logs that request itself.
      await page.getByRole("region", { name: "Recap" }).getByText("LLM_API_KEY is not configured on the server.", { exact: false }).waitFor({ timeout: 10000 });
      const unexpected = problems.filter((p) => !/status of 503/.test(p));
      assert(unexpected.length === 0, unexpected.join("; "));
      await context.close();
      return text.replace(/\n+/g, " · ");
    } finally {
      servers("start", "api");
    }
  });

  await scenario("17 model without structured outputs: falls back to prompt-only JSON", async () => {
    await control("/__control/reset");
    await control("/__control/llm?mode=no_schema");
    try {
      const { context, page, problems } = await openSession(browser);
      await page.getByRole("button", { name: "Load sample project docs" }).click();
      await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
      await chooseMicAndStart(page);
      await status(page, "Live").waitFor({ timeout: 20000 });
      await page.getByText("Selamat datang kembali", { exact: false }).first().waitFor({ timeout: 20000 });
      await page.getByText("Bagaimana aplikasi Anda menangani concurrent updates", { exact: false }).first().waitFor({ timeout: 20000 });
      await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Stop session" }).click();
      const log = await fakeLog();
      const formats = (name) => log.llm.filter((c) => c.name === name).map((c) => c.format);
      const analysis = formats("turn_analysis");
      const answer = formats("grounded_answer");
      // First call walks the chain; later calls on the same model go straight to the prompt.
      assert(analysis.slice(0, 3).join() === "json_schema,json_object,prompt", `analysis: ${analysis}`);
      assert(analysis.slice(3).every((f) => f === "prompt") && analysis.length >= 4, `analysis: ${analysis}`);
      // The answer model is a different model, so it learns on its own.
      assert(answer.slice(0, 3).join() === "json_schema,json_object,prompt", `answer: ${answer}`);
      assert(problems.length === 0, problems.join("; "));
      await context.close();
      return `analysis formats: ${analysis.join(" → ")} | answer formats: ${answer.join(" → ")}`;
    } finally {
      await control("/__control/llm?mode=ok");
      servers("start", "api"); // forget the learned fallbacks
    }
  });

  await scenario("18 rate limited (429): one quiet retry, then a clear reason; Retry recovers", async () => {
    await control("/__control/reset");
    await control("/__control/llm?mode=rate_limit");
    const { context, page, problems } = await openSession(browser);
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    const reason = `${PROVIDER} returned HTTP 429: Rate limit exceeded: free-models-per-day`;
    await page.getByText(`Translation failed. ${reason}`, { exact: false }).first().waitFor({ timeout: 20000 });
    const log = await fakeLog();
    const first = log.llm.filter((c) => c.name === "turn_analysis");
    assert(first.length >= 2, `a rate-limited turn should be tried twice: ${first.length}`);
    await control("/__control/llm?mode=ok");
    await page.getByRole("button", { name: "Retry" }).first().click();
    await page.getByText("Selamat datang kembali", { exact: false }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return `${first.length} analysis attempts while limited; retry recovered`;
  });

  await scenario("19 reasoning model cut off at the token limit: retried with room, translation arrives", async () => {
    await control("/__control/reset");
    await control("/__control/llm?mode=reasoning_cut");
    try {
      const { context, page, problems } = await openSession(browser);
      await chooseMicAndStart(page);
      await status(page, "Live").waitFor({ timeout: 20000 });
      await page.getByText("Selamat datang kembali", { exact: false }).first().waitFor({ timeout: 20000 });
      await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Stop session" }).click();
      // Let the recap finish, so its LLM call doesn't land in the next scenario's log.
      await page.getByRole("region", { name: "Recap" }).getByText("Tim membahas", { exact: false }).waitFor({ timeout: 15000 });
      const failed = await page.getByText("Translation failed", { exact: false }).count();
      assert(failed === 0, "no translation should fail");
      const log = await fakeLog();
      const budgets = (name) => log.llm.filter((c) => c.name === name).map((c) => c.max_tokens);
      const analysis = budgets("turn_analysis");
      const answer = budgets("grounded_answer");
      assert(analysis.slice(0, 2).join() === "1200,2400", `analysis budgets: ${analysis}`);
      assert(answer.slice(0, 2).join() === "900,1800", `answer budgets: ${answer}`);
      assert(problems.length === 0, problems.join("; "));
      await context.close();
      return `analysis budgets ${analysis.join(", ")} | answer budgets ${answer.join(", ")}`;
    } finally {
      await control("/__control/llm?mode=ok");
    }
  });

  await scenario("20 sleeping API: waking notice, preview fallback, back to live", async () => {
    await control("/__control/reset");
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.grantPermissions(["microphone"], { origin: "http://localhost:3000" });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    // Free hosting holds the first request while the API boots.
    let held = true;
    await page.route("**/health", async (route) => {
      if (held) await new Promise((resolve) => setTimeout(resolve, 7000));
      await route.continue();
    });
    await page.goto(APP);
    await page.getByText("Waking up the Contexa API…").waitFor({ timeout: 8000 });
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    held = false;
    // The preview is one click away, even with an API configured.
    await page.reload();
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    await page.route("**/health", (route) => route.abort());
    await page.reload();
    await page.getByText("Can't reach the Contexa API").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Open the preview" }).click();
    await page.waitForURL("**/session?preview");
    await page.getByText("Scripted preview", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Load sample project docs" }).click();
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 15000 });
    await transcript(page).locator("article").nth(2).waitFor({ timeout: 40000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    const recap = page.getByRole("region", { name: "Recap" });
    await recap.getByText("Sesi tanya jawab dengan tim", { exact: false }).waitFor({ timeout: 10000 });
    const recapText = await recap.innerText();
    assert(recapText.includes("optimistic locking"), `preview recap: ${recapText}`);
    await page.unroute("**/health");
    await page.getByRole("button", { name: "Go live" }).count().then((n) => assert(n === 0, "Go live shows on the setup screen only"));
    await page.getByRole("button", { name: "New session" }).first().click();
    await page.getByRole("button", { name: "Go live" }).click();
    await page.waitForURL((url) => url.pathname === "/session" && !url.search);
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    const log = await fakeLog();
    assert(log.connections.length === 0 && log.llm.length === 0, "the preview must not call AssemblyAI or the LLM");
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return recapText.replace(/\n+/g, " · ").slice(0, 160);
  });

  await scenario("21 recap fails, then Retry recap works; nothing to recap without speech", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    await control("/__control/llm?mode=fail");
    await page.getByRole("button", { name: "Stop session" }).click();
    const recap = page.getByRole("region", { name: "Recap" });
    await recap.getByText(`Couldn't write the recap. ${PROVIDER} returned HTTP 403`, { exact: false }).waitFor({ timeout: 15000 });
    await control("/__control/llm?mode=ok");
    await recap.getByRole("button", { name: "Retry recap" }).click();
    await recap.getByText("Tim membahas cara Notewave", { exact: false }).waitFor({ timeout: 15000 });
    // A session without speech has no recap to write.
    await page.getByRole("button", { name: "New session" }).first().click();
    await control("/__control/reset");
    await page.locator('label:has-text("Microphone")').first().click();
    await page.getByRole("button", { name: "Start listening" }).click();
    await status(page, "Live").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText(/Session ended|No speech was captured/).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const recaps = await page.getByRole("region", { name: "Recap" }).count();
    const log = await fakeLog();
    assert(recaps === 0 && !log.llm.some((c) => c.name === "session_recap"), "no recap without turns");
    // The browser logs the failed recap request itself (502); only script errors count.
    const unexpected = problems.filter((p) => !/status of 502/.test(p));
    assert(unexpected.length === 0, unexpected.join("; "));
    await context.close();
  });

  await scenario("22 audio file source: plays through the pipeline, stops at the end, recap follows", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    await page.getByRole("button", { name: "Load sample project docs" }).click();
    await page.getByText(/Ready · \d+ chunks?/).nth(1).waitFor({ timeout: 15000 });
    await page.locator('label:has-text("Audio file")').first().click();
    const startButton = page.getByRole("button", { name: "Start listening" });
    assert(await startButton.isDisabled(), "Start needs a recording first");
    // Not audio at all: a clear reason, and the session can start again.
    fs.writeFileSync(path.join(SP, "bad.mp3"), "not really audio");
    await page.getByLabel("Recording to play").setInputFiles(path.join(SP, "bad.mp3"));
    await page.getByText("bad.mp3").waitFor();
    await startButton.click();
    const alert = page.getByRole("alert").filter({ hasText: "Couldn't start the session" });
    await alert.waitFor({ timeout: 20000 });
    const badText = await alert.innerText();
    assert(badText.includes("can't play “bad.mp3”"), badText);
    // A real recording: 7 s of audio, streamed in real time.
    await page.getByLabel("Recording to play").setInputFiles(path.join(SP, "tone.wav"));
    await page.getByText("tone.wav").waitFor();
    await page.getByRole("button", { name: "Try again" }).click();
    await status(page, "Live").waitFor({ timeout: 20000 });
    const readout = await page.locator("footer").innerText();
    assert(readout.includes("tone.wav"), `control bar: ${readout}`);
    await transcript(page).getByText(QUESTION, { exact: false }).waitFor({ timeout: 20000 });
    await page.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    // No Stop click: the session ends shortly after the recording does.
    await page.getByText("Session ended").waitFor({ timeout: 20000 });
    await page.getByRole("region", { name: "Recap" }).getByText("Tim membahas", { exact: false }).waitFor({ timeout: 15000 });
    const log = await fakeLog();
    const connection = log.connections.at(-1);
    const seconds = connection.audio_bytes / 32000;
    assert(connection.closed_by === "terminate", `closed_by ${connection.closed_by}`);
    assert(seconds >= 7 && seconds < 12, `streamed ${seconds.toFixed(1)} s of audio`);
    const unexpected = problems.filter((p) => !/bad\.mp3|MEDIA_ELEMENT_ERROR|NotSupportedError/.test(p));
    assert(unexpected.length === 0, unexpected.join("; "));
    await context.close();
    return `bad file: ${badText.split("\n").at(-1)} | streamed ${seconds.toFixed(1)} s, then auto-stopped`;
  });

  await scenario("23 answer styles: setup choice shapes the prompt, redraft in another style; Listen reads it aloud", async () => {
    await control("/__control/reset");
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.grantPermissions(["microphone"], { origin: "http://localhost:3000" });
    // Record what the page asks the browser to say instead of producing sound.
    await context.addInitScript(() => {
      window.__spoken = [];
      const synth = {
        speaking: false,
        getVoices: () => [],
        cancel() { this.current?.onend?.(); this.current = null; },
        speak(utterance) { this.current = utterance; window.__spoken.push({ text: utterance.text, lang: utterance.lang }); },
      };
      Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ""; } };
    });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    await page.goto(APP);
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    await page.getByRole("radiogroup", { name: "Answer style" }).getByText("Technical").click();
    await page.getByText("Names the mechanisms and trade-offs.", { exact: false }).waitFor();
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    const copilot = page.getByRole("complementary", { name: "Response copilot" });
    await copilot.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 20000 });
    const styleButton = copilot.getByRole("button", { name: /Answer style: Technical/ });
    await styleButton.waitFor();
    // Listen reads the ready-to-say answer in its language.
    await copilot.getByRole("button", { name: "Listen" }).click();
    await copilot.getByRole("button", { name: "Stop" }).waitFor();
    const spoken = await page.evaluate(() => window.__spoken);
    assert(spoken.length === 1 && spoken[0].text === "We use optimistic locking with a version column." && spoken[0].lang === "en-US", JSON.stringify(spoken));
    await copilot.getByRole("button", { name: "Stop" }).click();
    await copilot.getByRole("button", { name: "Listen" }).waitFor();
    // Redraft the same answer as Concise.
    await styleButton.click();
    await page.getByRole("menuitem", { name: /Concise/ }).click();
    await copilot.getByRole("button", { name: /Answer style: Concise/ }).waitFor({ timeout: 15000 });
    await copilot.getByText("We use optimistic locking with a version column.").waitFor({ timeout: 15000 });
    const cards = await copilot.locator("article").count();
    assert(cards === 1, `the redraft should replace the answer, got ${cards} cards`);
    await page.getByRole("button", { name: "Stop session" }).click();
    const log = await fakeLog();
    const answers = log.llm.filter((c) => c.name === "grounded_answer");
    assert(answers.length === 2, `answer calls: ${answers.length}`);
    assert(answers[0].system.includes("name the mechanisms, components, and trade-offs"), "first answer should be technical");
    assert(answers[1].system.includes("one or two short sentences"), "redraft should be concise");
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return "technical → concise redraft, 1 card; Listen spoke en-US";
  });

  await scenario("24 link import: a web page is Ready with its source, answers cite it, removal works", async () => {
    await control("/__control/reset");
    await control("/__control/script?name=pricing");
    const { context, page, problems } = await openSession(browser);
    await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
    await addLink(page, `${FAKE}/pages/notewave`);
    // Named after the page's <title> once the API has fetched it.
    const item = documentItem(page, "Notewave pricing and plans");
    await item.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
    const itemText = (await item.innerText()).replace(/\n+/g, " · ");
    // The kind badge is uppercase through CSS.
    assert(itemText.includes("127.0.0.1:8100/pages/notewave") && /\bweb\b/i.test(itemText), `document: ${itemText}`);
    await addLink(page, `${FAKE}/pages/notewave`);
    await page.getByText("This link is already attached.").waitFor({ timeout: 5000 });
    await chooseMicAndStart(page);
    await status(page, "Live").waitFor({ timeout: 20000 });
    await transcript(page).getByText("How much does the Pro plan cost per month?").waitFor({ timeout: 20000 });
    const copilot = page.getByRole("complementary", { name: "Response copilot" });
    await copilot.getByText("The Pro plan costs 8 dollars per month per seat.").waitFor({ timeout: 20000 });
    const evidence = await copilot.innerText();
    assert(evidence.includes("Notewave pricing and plans · Plans"), `evidence: ${evidence}`);
    await item.getByText("Cited").waitFor();
    await page.getByRole("button", { name: "Stop session" }).click();
    await page.getByText("Session ended").waitFor({ timeout: 10000 });
    // Removing it deletes it from the API session too.
    const deleted = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/documents/"));
    await item.hover();
    await item.getByRole("button", { name: "Remove Notewave pricing and plans" }).click();
    const response = await deleted;
    assert(response.status() === 204, `DELETE returned ${response.status()}`);
    const left = await page.locator('ul[aria-label="Attached documents"] li').count();
    assert(left === 0, `documents left: ${left}`);
    assert(problems.length === 0, problems.join("; "));
    await context.close();
    return itemText;
  });

  await scenario("25 link import: a GitHub repo becomes one document; a missing repo and a private address show the API's reason", async () => {
    await control("/__control/reset");
    const { context, page, problems } = await openSession(browser);
    try {
      await page.getByText("Connected to the Contexa API").waitFor({ timeout: 10000 });
      await addLink(page, "https://github.com/acme/notewave");
      const repo = documentItem(page, "acme/notewave");
      await repo.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
      const repoText = (await repo.innerText()).replace(/\n+/g, " · ");
      assert(/\brepo\b/i.test(repoText) && repoText.includes("github.com/acme/notewave"), `repo: ${repoText}`);
      // README (intro + Getting started) and docs/architecture.md; src/app.ts is skipped.
      assert(repoText.includes("Ready · 3 chunks"), `README and docs only: ${repoText}`);
      await addLink(page, "github.com/nobody/missing");
      const missing = documentItem(page, "github.com/nobody/missing");
      await missing.getByText("Couldn't import this link").waitFor({ timeout: 15000 });
      const missingText = await missing.innerText();
      assert(missingText.includes("GitHub has no public repository nobody/missing"), missingText);
      await missing.hover();
      await missing.getByRole("button", { name: /^Remove / }).click();
      // Production settings: links to local or private addresses are refused before any request.
      servers("start", "api", { IMPORTS: "public" });
      await addLink(page, "http://localhost/admin");
      const local = documentItem(page, "localhost/admin");
      await local.getByText("Couldn't import this link").waitFor({ timeout: 20000 });
      const localText = await local.innerText();
      assert(localText.includes("That address points to a private or local network"), localText);
      // The restarted API lost the session; the repository was imported again into the new one.
      await repo.getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
      const documents = await page.locator('ul[aria-label="Attached documents"] li').count();
      assert(documents === 2, `documents: ${documents}`);
      // The browser logs the rejected imports and the lost session itself; only script errors count.
      const unexpected = problems.filter((p) => !/status of (404|422)/.test(p));
      assert(unexpected.length === 0, unexpected.join("; "));
      const reason = (text) => text.split("\n").find((line) => /GitHub has no|private or local/.test(line));
      return `${reason(missingText)} | ${reason(localText)}`;
    } finally {
      await context.close();
      servers("start", "api");
    }
  });

  await scenario("26 semantic retrieval: an Indonesian question with no shared words finds the imported page by meaning", async () => {
    await control("/__control/reset");
    await control("/__control/script?name=pricing_id");
    servers("start", "api", { EMBEDDINGS: "on" });
    try {
      const { context, page, problems } = await openSession(browser);
      const banner = page.getByText("Connected to the Contexa API");
      await banner.waitFor({ timeout: 10000 });
      const bannerText = await banner.innerText();
      assert(bannerText.includes("semantic search on fake-embed"), `banner: ${bannerText}`);
      await page.getByRole("combobox", { name: "Speakers talk in" }).click();
      await page.getByRole("option", { name: /Indonesian/ }).click();
      await addLink(page, `${FAKE}/pages/notewave`);
      await documentItem(page, "Notewave pricing and plans").getByText(/Ready · \d+ chunks?/).waitFor({ timeout: 15000 });
      await page.getByText("searched by keyword and by meaning", { exact: false }).waitFor();
      await chooseMicAndStart(page);
      await status(page, "Live").waitFor({ timeout: 20000 });
      await transcript(page).getByText("Berapa harga langganannya setiap bulan?").waitFor({ timeout: 20000 });
      const copilot = page.getByRole("complementary", { name: "Response copilot" });
      await copilot.getByText("Paket Pro harganya 8 dolar per bulan per pengguna.").first().waitFor({ timeout: 20000 });
      const evidence = await copilot.innerText();
      // The question shares no word with the English page, and the analysis gave no keywords.
      assert(evidence.includes("Notewave pricing and plans · Plans"), `evidence: ${evidence}`);
      await page.getByRole("button", { name: "Stop session" }).click();
      const log = await fakeLog();
      const analysis = log.llm.filter((c) => c.name === "turn_analysis");
      assert(analysis.length === 1, `analysis calls: ${analysis.length}`);
      // One call for the page's chunks, one for the question.
      assert(log.embeddings.length >= 2 && log.embeddings.every((e) => e.model === "fake-embed"), JSON.stringify(log.embeddings));
      assert(problems.length === 0, problems.join("; "));
      await context.close();
      return `${log.embeddings.length} embedding calls (${log.embeddings.map((e) => e.inputs).join(", ")} inputs)`;
    } finally {
      servers("start", "api");
    }
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
