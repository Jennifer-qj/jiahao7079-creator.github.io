import { NextRequest, NextResponse } from "next/server";
import research from "../../../public/data/research.json";
import text from "../../../public/data/text.json";

type Citation = { id: string; label: string; excerpt: string };
type Tool = { name: string; detail: string };
const scenes = research.meta.scope.primaryScenes;
const clean = (value: string) => value.replace(/\s+/g, "").toLowerCase();

function score(haystack: string, query: string) {
  const q = clean(query);
  const h = clean(haystack);
  let value = 0;
  for (const token of q.match(/[\u4e00-\u9fff]{2,4}|[a-z0-9]+/g) || []) if (h.includes(token)) value += token.length;
  return value;
}

function retrieve(query: string) {
  const tools: Tool[] = [];
  const citations: Citation[] = [];
  const mentionedScenes = scenes.filter((scene) => query.includes(scene));
  const curveRank = research.curves.filter((x) => x.primary).map((curve) => ({
    curve,
    score: score(`${curve.scene}${curve.tune}${curve.rhythmDescription}${curve.formEmotion}`, query)
      + (mentionedScenes.includes(curve.scene) ? 12 : 0)
      + (/句式|长短|伸缩/.test(query) ? curve.metrics.lineLengthCv * 5 : 0)
      + (/平仄|声调|仄声/.test(query) ? curve.metrics.alternationRate * 4 : 0)
      + (/韵|换韵/.test(query) ? curve.rhymeChanges * .7 : 0),
  })).sort((a, b) => b.score - a.score);

  let selected = curveRank.filter((x) => x.score > 0).slice(0, 4).map((x) => x.curve);
  if (!selected.length) selected = [...research.curves.filter((x) => x.primary)].sort((a, b) => b.metrics.lineLengthCv - a.metrics.lineLengthCv).slice(0, 4);
  tools.push({ name: "曲牌度量检索", detail: `检索80支主研究曲词，命中${selected.length}支高相关曲牌` });
  selected.forEach((curve, i) => citations.push({
    id: `C${i + 1}`, label: `曲词表 · ${curve.scene} ·【${curve.tune}】`,
    excerpt: `${curve.formEmotion}（仄声比${Math.round(curve.metrics.obliqueRatio * 100)}%，交替率${Math.round(curve.metrics.alternationRate * 100)}%，句长变异${curve.metrics.lineLengthCv}，换韵${curve.rhymeChanges}次）`,
  }));

  const targetScenes = mentionedScenes.length ? mentionedScenes : [...new Set(selected.map((x) => x.scene))].slice(0, 2);
  const chapterNames = targetScenes.map((scene) => research.sceneSummaries.find((x) => x.scene === scene)?.chapter).filter(Boolean);
  const chunks = text.chapters.flatMap((chapter) => chapter.chunks.map((chunk, i) => ({ chapter: chapter.chapter, chunk, index: i + 1 })))
    .map((item) => ({ ...item, score: score(item.chunk, query) + (chapterNames.includes(item.chapter as never) ? 7 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  tools.push({ name: "原文片段检索", detail: `在55出原文中检索，返回${chunks.length}个可核对片段` });
  chunks.forEach((item, i) => citations.push({ id: `T${i + 1}`, label: `原文 · ${item.chapter} · 片段${item.index}`, excerpt: item.chunk.slice(0, 190) + (item.chunk.length > 190 ? "……" : "") }));

  const names = ["杜丽娘", "柳梦梅", "春香", "杜宝", "陈最良", "甄氏", "石道姑"].filter((name) => query.includes(name));
  let relations: typeof research.relations = [];
  if (names.length || /关系|人物|网络|对话/.test(query)) {
    relations = research.relations.filter((x) => !names.length || names.some((name) => x.a.includes(name) || x.b.includes(name))).filter((x) => x.event).slice(0, 3);
    tools.push({ name: "人物关系查询", detail: `从178条关系事件中返回${relations.length}条相关记录` });
    relations.forEach((item, i) => citations.push({ id: `R${i + 1}`, label: `关系表 · ${item.a}—${item.relation}—${item.b} · ${item.scene}`, excerpt: item.event }));
  }

  if (mentionedScenes.length > 1 || /比较|对比|差异|轨迹/.test(query)) {
    tools.push({ name: "场景比较", detail: `比较${(mentionedScenes.length ? mentionedScenes : targetScenes).join("、")}的场景聚合指标` });
  }
  return { selected, chunks, relations, citations, tools, mentionedScenes, targetScenes };
}

function fallbackAnswer(query: string, result: ReturnType<typeof retrieve>) {
  const { selected, mentionedScenes, targetScenes } = result;
  const compared = (mentionedScenes.length ? mentionedScenes : targetScenes).map((name) => research.sceneSummaries.find((x) => x.scene === name)).filter(Boolean);
  const top = selected[0];
  let answer = "结论：格律形式不是给情感贴标签，而是在时间中组织情感——它控制铺陈有多长、语势在哪里受阻，以及心理转折何时发生。";
  if (/比较|对比|差异/.test(query) && compared.length > 1) {
    const [a, b] = compared;
    answer += `\n场景比较：${a!.scene}的句长变异为${a!.metrics.lineLengthCv}、平均换韵${a!.metrics.rhymeChanges}次；${b!.scene}分别为${b!.metrics.lineLengthCv}和${b!.metrics.rhymeChanges}次。这说明两场的“情感运动方式”不同，但仍需回到具体曲牌判断这种差异承担了何种叙事功能。`;
  } else if (/哪几支|排名|最高|明显/.test(query)) {
    answer += `\n证据入口：本次检索最值得优先细读的是${selected.slice(0, 3).map((x) => `${x.scene}【${x.tune}】`).join("、")}。它们在句长伸缩、平仄配置或换韵上呈现较强特征，人工解释也提供了语义桥梁。`;
  } else {
    answer += `\n第一，句式伸缩形成“铺陈—骤收”的节奏；第二，平仄密度与交替调节急迫、阻滞和回旋；第三，换韵与心理或场景转向协同。${top ? `${top.scene}【${top.tune}】可作为切入口：${top.formEmotion}` : ""}`;
  }
  answer += "\n证据边界：这些指标支持描述性比较与计算辅助细读，不能单独证明因果。建议沿下列引证回到原文，核对说话人、上下文与舞台动作。";
  return answer;
}

async function llmAnswer(query: string, result: ReturnType<typeof retrieve>) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const evidence = result.citations.map((x) => `[${x.id}] ${x.label}\n${x.excerpt}`).join("\n\n");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4.1-mini", temperature: 0.2,
      messages: [
        { role: "system", content: "你是《牡丹亭》数字人文研究助手。只能依据给定证据回答；区分描述、解释与因果；每个关键判断用[C1]等引证编号；不要编造曲词或版本信息；用简洁中文。" },
        { role: "user", content: `问题：${query}\n\n证据：\n${evidence}` },
      ],
    }),
  });
  if (!response.ok) return null;
  const json = await response.json();
  return json.choices?.[0]?.message?.content || null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const query = String(body.query || "").slice(0, 500);
  if (!query.trim()) return NextResponse.json({ error: "请输入研究问题。" }, { status: 400 });
  const result = retrieve(query);
  const generated = await llmAnswer(query, result).catch(() => null);
  return NextResponse.json({
    answer: generated || fallbackAnswer(query, result),
    mode: generated ? "llm" : "evidence",
    citations: result.citations,
    tools: result.tools,
  });
}
