import research from "../public/data/research.json" with { type: "json" };
import textData from "../public/data/text.json" with { type: "json" };
import knowledgeData from "../public/data/knowledge.json" with { type: "json" };
import { createResearchTools, RESEARCH_TOOL_DEFINITIONS } from "../lib/research-tools.mjs";

const tools = createResearchTools(research, textData, knowledgeData);
const recentRequests = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const REQUESTS_PER_WINDOW = 12;
const MAX_TOOL_ROUNDS = 4;
const ALLOWED_ORIGINS = new Set([
  "https://jennifer-qj.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SYSTEM_PROMPT = `你是“曲情证”，一名面向普通读者与研究者的《牡丹亭还魂记》通用型知识与研究助手。

你有四层可追溯材料：
1. 权威机构与学术论文整理的作品、作者、人物、昆曲、思想史与传播基础知识；
2. 《牡丹亭》五十五出全文；
3. 本项目人工核验的八十支曲词格律、句长、韵脚与“形式—情感”解释；
4. 人物关系、场景比较和计算指标。

先判断问题属于“通识”“原文”“人物关系”还是“专题研究”，再选工具。第一轮必须使用工具。

表达规则：
- 通识问题要像一位熟悉作品的老师自然作答：先直接回答“是什么/是谁/为什么”，再补充必要背景。不要强行写“数据事实”“项目人物档案”“证据边界”，不要为了显示技术而堆表格或小标题。
- 原文问题要给出简短引文并标明出目；不编造原文。
- 专题研究问题才需要明确区分人工标注、计算观察与综合解释，并说明方法边界。
- 有争议的解释要呈现主要观点差异，不把一种读法说成唯一结论。
- 形式指标只能作为细读线索，不能单独证明情感或因果；工具未提供排名时，不得声称“全剧最高/最低”。
- 语言清楚、连贯、克制，优先用短段落和少量要点。除非比较确有必要，不输出 Markdown 表格。
- 若材料不足，具体说明缺口，不用空泛的免责声明。
- 不要声称经过微调或预训练；本系统的提升来自分层知识库、问题路由、提示词工程、工具调用、RAG与评测。`;

const ROUTE_INSTRUCTIONS = {
  general: "本轮是通识问题。优先检索基础知识，直接、自然地回答，不要展示数据库口吻，也不要强制分层或附加“证据边界”。",
  text: "本轮是原文与出处问题。优先检索五十五出全文，引用要短，并准确标明出目；可补充必要的语境解释。",
  relation: "本轮是人物与关系问题。先给人物/关系的自然概述，再用人物事件或基础知识补充关键情节，不要把事件清单机械抄成表格。",
  research: "本轮是专题研究问题。组合曲词格律、场景、原文或关系证据，区分人工标注、计算观察与综合解释，并用一句话说明研究边界。",
};

function classifyQuestion(question) {
  const text = String(question || "");
  if (/平仄|格律|句式|句长|韵脚|押韵|换韵|曲牌|量化|指标|相关|形式.*情|场景比较|比较.*(?:惊梦|寻梦|闹殇|冥判|回生)/.test(text)) return "research";
  if (/原文|出自|出处|哪一出|上下文|名句|唱词|台词|原句|全文/.test(text)) return "text";
  if (/关系|相识|相遇|结为|夫妻|父女|母女|主仆|师生|谁和谁/.test(text)) return "relation";
  return "general";
}

function preferredTool(route) {
  if (route === "text") return "search_play_text";
  if (route === "relation") return "get_relation_events";
  if (route === "research") return "search_prosody";
  return "search_background_knowledge";
}

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
    search_background_knowledge: "基础知识",
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
        : value.title || value.relation || value.event || value.evidence_id;
    const excerpt = value.excerpt
      || value.summary
      || value.details
      || value.human_interpretation
      || value.event
      || value.relation
      || JSON.stringify(value.metrics || {}).slice(0, 220);
    output.push({ id: value.evidence_id, label, excerpt: String(excerpt || "").slice(0, 520) });
  }
  Object.values(value).forEach((item) => collectCitations(item, output));
  return output;
}

async function callDeepSeek(env, messages, firstRound, allowTools = true, firstTool = "") {
  const toolConfig = allowTools
    ? {
        tools: deepSeekTools(),
        tool_choice: firstRound && firstTool
          ? { type: "function", function: { name: firstTool } }
          : firstRound ? "required" : "auto",
      }
    : {};
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      messages,
      ...toolConfig,
      thinking: { type: "disabled" },
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

function answerNeedsRevision(answer, question) {
  const text = String(answer || "").trim();
  const entities = String(question).match(/[\u4e00-\u9fff]{2,4}/g) || [];
  const hasQuestionAnchor = entities.some((item) => text.includes(item));
  return text.length < 45
    || /欢迎提问|请问您想了解什么|请提出您的问题|我可以帮您/.test(text)
    || /全剧最高|全剧最低|全场景最高|全场景最低|最高之一|最低之一|高于.{0,12}任何|低于.{0,12}所有/.test(text)
    || (!hasQuestionAnchor && text.length < 120);
}

async function answerQuestion(env, question, history) {
  const route = classifyQuestion(question);
  const messages = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${ROUTE_INSTRUCTIONS[route]}` },
    ...compactHistory(history),
    { role: "user", content: question },
  ];
  const trace = [];
  const rawCitations = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const payload = await callDeepSeek(env, messages, round === 0, true, preferredTool(route));
    const assistant = payload?.choices?.[0]?.message;
    if (!assistant) throw new Error("模型没有返回有效消息");

    messages.push(assistant);
    const toolCalls = assistant.tool_calls || [];
    if (!toolCalls.length) {
      let answer = assistant.content || "";
      if (answerNeedsRevision(answer, question) && trace.length) {
        messages.pop();
        messages.push({
          role: "user",
          content: route === "research"
            ? `请重新回答最初的问题“${question}”。综合刚才的工具结果，先给结论，再给2—4条证据，最后说明研究边界；删除任何没有工具排名支持的绝对判断。`
            : `请重新回答最初的问题“${question}”。综合刚才的材料，用自然、连贯的中文直接作答；不要说“数据事实”“项目人物档案”或“证据边界”，不要机械抄表，也不要再次邀请用户提问。`,
        });
        const synthesis = await callDeepSeek(env, messages, false, false);
        answer = synthesis?.choices?.[0]?.message?.content || answer;
      }
      return {
        answer: answer || "证据不足，暂时无法形成可靠回答。",
        mode: `llm-deepseek-${route}-rag`,
        model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        citations: [...new Map(rawCitations.map((item) => [item.id, item])).values()].slice(0, 10),
        tools: trace,
      };
    }

    for (const [index, call] of toolCalls.entries()) {
      const name = call.function?.name || "";
      const args = safeArguments(call.function?.arguments);
      const result = index < 8
        ? tools.execute(name, args)
        : { error: "本轮工具调用数量超过上限，请根据前八项结果完成回答。" };
      collectCitations(result, rawCitations);
      if (index < 8) trace.push({ name, detail: toolLabel(name, args) });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  messages.push({
    role: "user",
    content: route === "research"
      ? "请停止继续调用工具，根据已经获得的证据给出简洁结论，并明确研究边界。"
      : "请停止继续调用工具，根据已经获得的材料自然、直接地回答问题，不要输出数据库式字段清单。",
  });
  const payload = await callDeepSeek(env, messages, false);
  const answer = payload?.choices?.[0]?.message?.content;
  return {
    answer: answer || "已经检索到证据，但模型未能在限定轮次内完成综合。",
    mode: `llm-deepseek-${route}-rag`,
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
