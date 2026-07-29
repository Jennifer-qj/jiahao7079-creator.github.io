import assert from "node:assert/strict";
import worker from "../server/deepseek-worker.mjs";

const realFetch = globalThis.fetch;
let modelRound = 0;

globalThis.fetch = async (url, options) => {
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(options.body);
  assert.equal(body.model, "deepseek-v4-flash");
  assert.ok(body.tools.some((item) => item.function.name === "search_background_knowledge"));
  modelRound += 1;

  if (modelRound === 1) {
    assert.deepEqual(body.tool_choice, {
      type: "function",
      function: { name: "search_background_knowledge" },
    });
    return Response.json({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_background",
            type: "function",
            function: {
              name: "search_background_knowledge",
              arguments: JSON.stringify({ query: "杜丽娘是谁", categories: ["人物"], top_k: 4 }),
            },
          }],
        },
      }],
    });
  }

  assert.equal(body.tool_choice, "auto");
  assert.ok(body.messages.some((item) => item.role === "tool" && item.tool_call_id === "call_background"));
  return Response.json({
    choices: [{
      message: {
        role: "assistant",
        content: "杜丽娘是《牡丹亭》的女主人公、南安太守杜宝之女。她因游园惊梦而萌发爱情，经历因情而死、为情还魂，最终与柳梦梅结为夫妻。她既是全剧“至情”观念的承担者，也体现了个人生命欲望与礼法秩序之间的张力。",
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
assert.equal(reply.mode, "llm-deepseek-general-rag");
assert.equal(reply.model, "deepseek-v4-flash");
assert.match(reply.answer, /杜丽娘/);
assert.ok(reply.tools.some((item) => item.name === "search_background_knowledge"));
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
