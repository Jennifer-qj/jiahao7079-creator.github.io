import assert from "node:assert/strict";
import worker from "../server/deepseek-worker.mjs";

const realFetch = globalThis.fetch;
let modelRound = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(options.body);
  assert.equal(body.model, "deepseek-v4-flash");
  assert.ok(body.tools.some((item) => item.function.name === "get_character_profile"));
  modelRound += 1;
  if (modelRound === 1) {
    assert.equal(body.tool_choice, "required");
    return Response.json({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_profile",
            type: "function",
            function: { name: "get_character_profile", arguments: JSON.stringify({ name: "杜丽娘" }) },
          }],
        },
      }],
    });
  }
  assert.equal(body.tool_choice, "auto");
  assert.ok(body.messages.some((item) => item.role === "tool" && item.tool_call_id === "call_profile"));
  return Response.json({
    choices: [{
      message: {
        role: "assistant",
        content: "杜丽娘是全剧核心女性人物。数据表明，她与杜宝、甄氏、春香、陈最良和柳梦梅均有明确关系记录。",
      },
    }],
  });
};

const request = new Request("https://example.workers.dev/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://jennifer-qj.github.io" },
  body: JSON.stringify({ question: "杜丽娘是谁？", history: [] }),
});
const response = await worker.fetch(request, { DEEPSEEK_API_KEY: "test-only" });
const reply = await response.json();

assert.equal(response.status, 200);
assert.equal(reply.mode, "llm-deepseek-rag");
assert.equal(reply.model, "deepseek-v4-flash");
assert.match(reply.answer, /杜丽娘/);
assert.ok(reply.tools.some((item) => item.name === "get_character_profile"));
assert.ok(reply.citations.length >= 1);
assert.equal(modelRound, 2);

globalThis.fetch = realFetch;
console.log(JSON.stringify({
  ok: true,
  modelRounds: modelRound,
  tools: reply.tools.length,
  citations: reply.citations.length,
  answer: reply.answer,
}, null, 2));
