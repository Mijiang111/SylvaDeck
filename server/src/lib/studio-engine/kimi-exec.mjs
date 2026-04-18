#!/usr/bin/env node

const DEFAULT_MODEL = "moonshot-v1-128k";
const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";

function parseArgs(argv) {
  const args = argv.slice(2);
  let model = DEFAULT_MODEL;
  let baseUrl = process.env.KIMI_BASE_URL || DEFAULT_BASE_URL;
  let apiKey = process.env.KIMI_API_KEY || "";
  let selfCheck = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (arg === "--self-check") {
      selfCheck = true;
    } else if (arg === "--kimi-wrapper") {
      // sentinel consumed by the parent, ignore here
    } else if (arg === "-" || arg === "--") {
      // stdin marker
    }
  }

  return { model, baseUrl, apiKey, selfCheck };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function outputCodexJsonl(text) {
  // Emit in Codex item.completed format so cursor-cli.ts parseCodexJsonl works
  const line = JSON.stringify({
    type: "item.completed",
    item: {
      type: "agent_message",
      text,
    },
  });
  console.log(line);
}

async function main() {
  const { model, baseUrl, apiKey, selfCheck } = parseArgs(process.argv);

  if (selfCheck) {
    outputCodexJsonl(`Kimi self-check OK (${model})`);
    return;
  }

  if (!apiKey) {
    console.error("Kimi API key is missing. Set KIMI_API_KEY environment variable.");
    process.exit(1);
  }

  const prompt = await readStdin();
  if (!prompt.trim()) {
    console.error("No prompt received on stdin.");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`HTTP ${res.status}: ${body}`);
      process.exit(1);
    }

    if (!res.body) {
      console.error("Kimi API returned an empty response body.");
      process.exit(1);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line === "data: [DONE]") continue;
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          const content = parsed?.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            fullText += content;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
      try {
        const parsed = JSON.parse(buffer.trim().startsWith("data: ") ? buffer.trim().slice(6) : buffer.trim());
        const content = parsed?.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content.length > 0) {
          fullText += content;
        }
      } catch {
        // ignore
      }
    }

    outputCodexJsonl(fullText);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
