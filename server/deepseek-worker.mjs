import research from "../public/data/research.json" with { type: "json" };
import textData from "../public/data/text.json" with { type: "json" };
import { createResearchTools, RESEARCH_TOOL_DEFINITIONS } from "../lib/research-tools.mjs";

const tools = createResearchTools(research, textData);
const recentRequests = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const REQUESTS_PER_WINDOW = 12;
const MAX_TOOL_ROUNDS = 4;
const ALLOWED_ORIGINS = new Set([
  "https://jennifer-qj.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SYSTEM_PROMPT = `你是“曲情证”，一名专门研究汤显祖《牡丹亭》的数字人文研究助手。

你的任务不是泛泛介绍作品，而是用本项目的人工标注数据和原文回答问题。你可以调用：
1. 人物档案；
2. 五十五出原文检索；
3. 八十支人工核验曲词的格律、句长、韵脚及“形式—情感”解释；
4. 场景比较；
5. 人物关系事件。

回答规则：
- 第一轮必须调用至少一个工具；涉及解释时，优先组合两种证据。
- 只根据工具返回的证据陈述项目内事实，不编造曲牌、原文、数字或人物关系。
- 原文引用务必简短，并注明出目；格律分析注明场景、曲牌和关键指标。
- 清楚区分“数据事实”“人工标注解释”和“你的综合推断”。
- 形式指标只能作为细读线索，不能单独证明情感或因果。
- 若证据不足，直接说明缺口，并建议下一步查什么。
- 默认用清楚、自然的中文回答，先给结论，再给2—4条证据，最后用一句“证据边界”收束。
- 不要声称自己经过微调或预训练；本系统的提升来自提示词工程、工具调用、RAG和评测。`;

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://jennifer-qj.github.io",
    "access-control-allow-methods": "POST, OPTIONS, GET",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

function checkRateLimit(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const record = recentRequests.get(ip);
  if (!record || now - record.startedAt > WINDOW_MS) {
    recentRequests.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  record.count += 1;
  return record.count <= REQUESTS_PER_WINDOW;
}

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-6)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 1800) }));
}

function deepSeekTools() {
  return RESEARCH_TOOL_DEFINITIONS.map(({ name, description, parameters }) => ({
    type: "function",
    function: { name, description, parameters },
  }));
}

function safeArguments(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function toolLabel(name, args) {
  const labels = {
    get_character_profile: "人物档案",
    search_play_text: "原文检索",
    search_prosody: "格律检索",
    compare_scenes: "场景比较",
    get_relation_events: "关系事件",
  };
  const subject = args.name || args.query || args.character_a || args.scenes?.join("、") || "";
  return `${labels[name] || name}${subject ? `：${String(subject).slice(0, 34)}` : ""}`;
}

function collectCitations(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectCitations(item, output));
    return output;
  }
  if (value.evidence_id) {
    const label = value.chapter
      ? `${value.chapter}${value.tune ? ` · 【${value.tune}】` : ""}`
      : value.scene
        ? `${value.scene}${value.tune ? ` · 【${value.tune}】` : ""}`
        : value.relation || value.event || value.evidence_id;
    const excerpt = value.excerpt
      || value.human_interpretation
      || value.event
      || value.relation
      || JSON.stringify(value.metrics || {}).slice(0, 220);
    output.push({ id: value.evidence_id, label, excerpt: String(excerpt || "").slice(0, 520) });
  }
  Object.values(value).forEach((item) => collectCitations(item, output));
  return output;
}

async function callDeepSeek(env, messages, firstRound) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      messages,
      tools: deepSeekTools(),
      tool_choice: firstRound ? "required" : "auto",
      temperature: 0.2,
      max_tokens: 1400,
      stream: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `DeepSeek API ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function answerQuestion(env, question, history) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...compactHistory(history),
    { role: "user", content: question },
  ];
  const trace = [];
  const rawCitations = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const payload = await callDeepSeek(env, messages, round === 0);
    const assistant = payload?.choices?.[0]?.message;
    if (!assistant) throw new Error("模型没有返回有效消息");

    messages.push(assistant);
    const toolCalls = assistant.tool_calls || [];
    if (!toolCalls.length) {
      return {
        answer: assistant.content || "证据不足，暂时无法形成可靠回答。",
        mode: "llm-deepseek-rag",
        model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        citations: [...new Map(rawCitations.map((item) => [item.id, item])).values()].slice(0, 10),
        tools: trace,
      };
    }

    for (const call of toolCalls.slice(0, 4)) {
      const name = call.function?.name || "";
      const args = safeArguments(call.function?.arguments);
      const result = tools.execute(name, args);
      collectCitations(result, rawCitations);
      trace.push({ name, detail: toolLabel(name, args) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  messages.push({
    role: "user",
    content: "请停止继续调用工具，根据已经获得的证据给出简洁结论，并明确证据边界。",
  });
  const payload = await callDeepSeek(env, messages, false);
  const answer = payload?.choices?.[0]?.message?.content;
  return {
    answer: answer || "已经检索到证据，但模型未能在限定轮次内完成综合。",
    mode: "llm-deepseek-rag",
    model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    citations: [...new Map(rawCitations.map((item) => [item.id, item])).values()].slice(0, 10),
    tools: trace,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, {
        ok: true,
        service: "曲情证 DeepSeek Agent",
        model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      });
    }
    if (request.method !== "POST" || url.pathname !== "/api/chat") {
      return jsonResponse(request, { error: "Not found" }, 404);
    }
    if (!env.DEEPSEEK_API_KEY) return jsonResponse(request, { error: "服务尚未配置模型密钥" }, 503);
    if (!checkRateLimit(request)) return jsonResponse(request, { error: "提问过于频繁，请十分钟后再试" }, 429);

    try {
      const body = await request.json();
      const question = typeof body?.question === "string" ? body.question.trim() : "";
      if (!question) return jsonResponse(request, { error: "请输入问题" }, 400);
      if (question.length > 600) return jsonResponse(request, { error: "问题请控制在600字以内" }, 400);
      return jsonResponse(request, await answerQuestion(env, question, body.history));
    } catch (error) {
      return jsonResponse(request, { error: error?.message || "智能体暂时不可用" }, 502);
    }
  },
};
