type Citation = { id: string; label: string; excerpt: string };
type Tool = { name: string; detail: string };
type Scene = { scene: string; chapter: string; metrics: Record<string, number> };
type Curve = {
  scene: string; tune: string; primary: boolean; rhythmDescription: string; formEmotion: string;
  rhymeChanges: number; emotions: Record<string, number>; metrics: Record<string, number>;
};
type Research = {
  meta: { scope: { primaryScenes: string[] } }; curves: Curve[]; sceneSummaries: Scene[];
  entities: Record<string, Record<string, string[]>>;
  relations: { a: string; b: string; relation: string; event: string; scene: string; dialogueCount: number; dialogueChapters: number }[];
};
type TextData = { chapters: { chapter: string; chunks: string[] }[] };

const normalized = (value: string) => value.replace(/\s+/g, "").toLowerCase();
function score(haystack: string, query: string) {
  const q = normalized(query), h = normalized(haystack);
  return (q.match(/[\u4e00-\u9fff]{2,4}|[a-z0-9]+/g) || []).reduce((sum, token) => sum + (h.includes(token) ? token.length : 0), 0);
}

export function runEvidenceAgent(query: string, research: Research, text: TextData) {
  const tools: Tool[] = [], citations: Citation[] = [];
  const characterNames = ["杜丽娘", "柳梦梅", "春香", "杜宝", "甄氏", "陈最良", "石道姑"];
  const namedCharacters = characterNames.filter((name) => query.includes(name));
  const identityQuestion = namedCharacters.length === 1 && /是谁|什么人|人物|介绍|生平|经历/.test(query);
  if (identityQuestion) {
    const name = namedCharacters[0];
    const relations = research.relations
      .filter((item) => item.a.includes(name) || item.b.includes(name))
      .filter((item) => item.relation);
    const uniqueRelations = relations.filter((item, index, all) =>
      all.findIndex((other) => other.a === item.a && other.b === item.b && other.relation === item.relation) === index
    ).slice(0, 5);
    const appearances = Object.entries(research.entities).filter(([, fields]) =>
      (fields["人物"] || []).some((item) => item.includes(name)) || (fields[`${name}台词`] || []).some((item) => item && item !== "/")
    );
    const milestones = relations
      .filter((item) => item.event && ["惊梦", "闹殇", "回生", "婚走", "圆驾"].includes(item.scene))
      .filter((item, index, all) => all.findIndex((other) => other.scene === item.scene && other.event === item.event) === index)
      .slice(0, 5);
    tools.push({ name: "人物档案", detail: `检索55出实体与台词标注，${name}在${appearances.length}出中出现或发言` });
    tools.push({ name: "关系事件", detail: `检索178条关系事件，找到${uniqueRelations.length}组核心关系与${milestones.length}个叙事节点` });
    uniqueRelations.slice(0, 4).forEach((item, i) => citations.push({
      id: `R${i + 1}`,
      label: `关系表 · ${item.a}—${item.relation}—${item.b}`,
      excerpt: `${item.dialogueCount || 0}次对话，涉及${item.dialogueChapters || 0}出；${item.event || "关系由人工标注确认。"}`,
    }));
    milestones.slice(0, 4).forEach((item, i) => citations.push({
      id: `E${i + 1}`,
      label: `事件表 · ${item.scene}`,
      excerpt: item.event,
    }));
    const relationSentence = uniqueRelations.slice(0, 4).map((item) => {
      const other = item.a.includes(name) ? item.b : item.a;
      return `与${other}为${item.relation}关系`;
    }).join("，");
    const arcSentence = milestones.length
      ? milestones.map((item) => `${item.scene}：${item.event}`).join("；")
      : "现有数据未形成足够完整的事件轨迹。";
    const answer = name === "杜丽娘"
      ? `杜丽娘是《牡丹亭》的核心女性人物，也是“至情”命题最集中的承担者。就现有人工标注数据看，她是杜宝与甄氏之女、春香的主人、陈最良的学生，后来与柳梦梅结为夫妻；人物身份不是孤立标签，而是被父女伦理、闺塾教育、主仆陪伴和爱情关系共同规定的。\n她的叙事轨迹可概括为“由梦生情—因情而死—以情还魂—争取人间承认”：${arcSentence}\n因此，如果从本项目的研究问题回答，杜丽娘不仅是传奇女主人公，更是一个让格律形式参与情感推进的观察中心。下一步应继续比较她在“惊梦—寻梦—闹殇—回生—圆驾”中的句式伸缩、平仄压力与换韵位置，而不能只用‘痴情女子’概括她。\n数据依据：${relationSentence}。这些信息来自人工标注的实体、人物关系与事件表；涉及思想史评价时仍需回到具体曲文。`
      : `${name}是《牡丹亭》人物网络中的重要角色。现有数据确认：${relationSentence}。\n其相关叙事节点包括：${arcSentence}\n以上是由实体、关系和事件标注支持的人物小传；更细的性格或思想判断仍需结合相关出目原文。`;
    return { answer, mode: "evidence", citations, tools };
  }
  const scenes = research.meta.scope.primaryScenes;
  const mentioned = scenes.filter((scene) => query.includes(scene));
  const ranked = research.curves.filter((curve) => curve.primary).map((curve) => ({
    curve,
    score: score(`${curve.scene}${curve.tune}${curve.rhythmDescription}${curve.formEmotion}`, query)
      + (mentioned.includes(curve.scene) ? 12 : 0)
      + (/句式|长短|伸缩/.test(query) ? curve.metrics.lineLengthCv * 5 : 0)
      + (/平仄|声调|仄声/.test(query) ? curve.metrics.alternationRate * 4 : 0)
      + (/韵|换韵/.test(query) ? curve.rhymeChanges * .7 : 0),
  })).sort((a, b) => b.score - a.score);
  let selected = ranked.filter((item) => item.score > 0).slice(0, 4).map((item) => item.curve);
  if (!selected.length) selected = [...research.curves.filter((curve) => curve.primary)].sort((a, b) => b.metrics.lineLengthCv - a.metrics.lineLengthCv).slice(0, 4);
  tools.push({ name: "曲牌度量检索", detail: `检索80支主研究曲词，命中${selected.length}支高相关曲牌` });
  selected.forEach((curve, i) => citations.push({
    id: `C${i + 1}`, label: `曲词表 · ${curve.scene} ·【${curve.tune}】`,
    excerpt: `${curve.formEmotion}（仄声比${Math.round(curve.metrics.obliqueRatio * 100)}%，交替率${Math.round(curve.metrics.alternationRate * 100)}%，句长变异${curve.metrics.lineLengthCv}，换韵${curve.rhymeChanges}次）`,
  }));
  const targetScenes = mentioned.length ? mentioned : [...new Set(selected.map((curve) => curve.scene))].slice(0, 2);
  const chapterNames = targetScenes.map((scene) => research.sceneSummaries.find((item) => item.scene === scene)?.chapter).filter(Boolean);
  const chunks = text.chapters.flatMap((chapter) => chapter.chunks.map((chunk, index) => ({ chapter: chapter.chapter, chunk, index: index + 1 })))
    .map((item) => ({ ...item, score: score(item.chunk, query) + (chapterNames.includes(item.chapter) ? 7 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  tools.push({ name: "原文片段检索", detail: `在55出原文中检索，返回${chunks.length}个可核对片段` });
  chunks.forEach((item, i) => citations.push({ id: `T${i + 1}`, label: `原文 · ${item.chapter} · 片段${item.index}`, excerpt: item.chunk.slice(0, 190) + (item.chunk.length > 190 ? "……" : "") }));
  const names = namedCharacters;
  if (names.length || /关系|人物|网络|对话/.test(query)) {
    const relations = research.relations.filter((item) => !names.length || names.some((name) => item.a.includes(name) || item.b.includes(name))).filter((item) => item.event).slice(0, 3);
    tools.push({ name: "人物关系查询", detail: `从178条关系事件中返回${relations.length}条相关记录` });
    relations.forEach((item, i) => citations.push({ id: `R${i + 1}`, label: `关系表 · ${item.a}—${item.relation}—${item.b} · ${item.scene}`, excerpt: item.event }));
  }
  if (mentioned.length > 1 || /比较|对比|差异|轨迹/.test(query)) tools.push({ name: "场景比较", detail: `比较${(mentioned.length ? mentioned : targetScenes).join("、")}的场景聚合指标` });
  const compared = (mentioned.length ? mentioned : targetScenes).map((name) => research.sceneSummaries.find((item) => item.scene === name)).filter(Boolean) as Scene[];
  const top = selected[0];
  let answer = "结论：格律形式不是给情感贴标签，而是在时间中组织情感——它控制铺陈有多长、语势在哪里受阻，以及心理转折何时发生。";
  if (/比较|对比|差异/.test(query) && compared.length > 1) {
    const [a, b] = compared;
    answer += `\n场景比较：${a.scene}的句长变异为${a.metrics.lineLengthCv}、平均换韵${a.metrics.rhymeChanges}次；${b.scene}分别为${b.metrics.lineLengthCv}和${b.metrics.rhymeChanges}次。这说明两场的“情感运动方式”不同，但仍需回到具体曲牌判断这种差异承担了何种叙事功能。`;
  } else if (/哪几支|排名|最高|明显/.test(query)) {
    answer += `\n证据入口：本次检索最值得优先细读的是${selected.slice(0, 3).map((item) => `${item.scene}【${item.tune}】`).join("、")}。它们在句长伸缩、平仄配置或换韵上呈现较强特征，人工解释也提供了语义桥梁。`;
  } else {
    answer += `\n第一，句式伸缩形成“铺陈—骤收”的节奏；第二，平仄密度与交替调节急迫、阻滞和回旋；第三，换韵与心理或场景转向协同。${top ? `${top.scene}【${top.tune}】可作为切入口：${top.formEmotion}` : ""}`;
  }
  answer += "\n证据边界：这些指标支持描述性比较与计算辅助细读，不能单独证明因果。建议沿下列引证回到原文，核对说话人、上下文与舞台动作。";
  return { answer, mode: "evidence", citations, tools };
}
