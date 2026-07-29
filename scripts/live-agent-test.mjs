const endpoint = process.env.AGENT_API_URL || "https://quqingzheng-agent.1723616293.workers.dev";
const questions = process.argv.slice(2);
const cases = questions.length ? questions : [
  "杜丽娘是谁？请根据项目数据简要回答，并给出证据边界。",
  "比较“惊梦”和“回生”的句式伸缩与平仄特征，这些形式差异如何参与情感表达？",
  "“原来姹紫嫣红开遍”出自哪一出？请给出附近原文，并说明它在情感表达中的作用。",
];

for (const question of cases) {
  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ question, history: [] }),
  });
  const reply = await response.json();
  console.log(JSON.stringify({
    question,
    status: response.status,
    answer: reply.answer || reply.error,
    model: reply.model,
    tools: reply.tools,
    citations: reply.citations?.slice(0, 4),
  }, null, 2));
}
