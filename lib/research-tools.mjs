const PRIMARY_CHARACTERS = ["杜丽娘", "柳梦梅", "春香", "杜宝", "甄氏", "陈最良", "石道姑"];
const PRIMARY_SCENES = ["惊梦", "寻梦", "写真", "闹殇", "拾画", "回生", "婚走", "圆驾"];

function compact(value = "") {
  return String(value).replace(/\s+/g, "").toLowerCase();
}

function tokens(value = "") {
  const text = compact(value);
  const words = text.match(/[a-z0-9]+|[\u4e00-\u9fff]{2,8}/g) || [];
  const grams = [];
  for (const word of words) {
    if (!/^[\u4e00-\u9fff]+$/.test(word)) {
      grams.push(word);
      continue;
    }
    grams.push(word);
    for (let size = 2; size <= Math.min(4, word.length); size += 1) {
      for (let index = 0; index <= word.length - size; index += 1) {
        grams.push(word.slice(index, index + size));
      }
    }
  }
  return [...new Set(grams)].filter((item) => item.length > 1);
}

function relevance(text, query) {
  const haystack = compact(text);
  const needle = compact(query);
  let total = haystack.includes(needle) && needle.length > 1 ? needle.length * 8 : 0;
  for (const token of tokens(query)) {
    const index = haystack.indexOf(token);
    if (index >= 0) total += token.length ** 2 + (index < 80 ? 2 : 0);
  }
  return total;
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function relationLabel(item) {
  return `${item.a}—${item.relation}—${item.b}`;
}

export const RESEARCH_TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "search_background_knowledge",
    description: "检索《牡丹亭》的基础知识与权威外部参考，包括作品、作者、剧情、人物、主题、文学史、昆曲、版本、演出和学术观点。基础性或通识性问题必须优先调用。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "用户关于《牡丹亭》的问题" },
        categories: { type: "array", items: { type: "string" }, description: "可选类别限制，如人物、剧情、主题、表演艺术" },
        top_k: { type: "integer", minimum: 1, maximum: 8 },
      },
      required: ["query", "categories", "top_k"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_character_profile",
    description: "查询人物身份、关系、出场/发言章节和关键叙事事件。人物基础问题必须先调用此工具。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "人物姓名，如杜丽娘、柳梦梅、春香" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "search_play_text",
    description: "在《牡丹亭》五十五出原文切片中检索词句、情节或概念，返回可引用原文。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索问题、关键词或待核对语句" },
        chapters: { type: "array", items: { type: "string" }, description: "可选的出目限定" },
        top_k: { type: "integer", minimum: 1, maximum: 8 },
      },
      required: ["query", "chapters", "top_k"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "search_prosody",
    description: "查询人工核验曲词的平仄、句长、换韵、情感向量与人工形式—情感解释。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "研究问题或形式特征" },
        scenes: { type: "array", items: { type: "string", enum: PRIMARY_SCENES } },
        metric: {
          type: "string",
          enum: ["relevance", "line_length_variation", "tone_alternation", "oblique_ratio", "rhyme_changes"],
        },
        top_k: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query", "scenes", "metric", "top_k"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "compare_scenes",
    description: "比较两个或多个关键场景的聚合格律指标，只提供描述性差异，不自动推断因果。",
    parameters: {
      type: "object",
      properties: {
        scenes: { type: "array", minItems: 2, maxItems: 8, items: { type: "string", enum: PRIMARY_SCENES } },
      },
      required: ["scenes"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_relation_events",
    description: "查询人物之间的关系类型、对话规模和按场景标注的关系事件。",
    parameters: {
      type: "object",
      properties: {
        character_a: { type: "string" },
        character_b: { type: "string", description: "不限定第二人时传空字符串" },
        top_k: { type: "integer", minimum: 1, maximum: 12 },
      },
      required: ["character_a", "character_b", "top_k"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export function createResearchTools(research, textData, knowledgeData = { entries: [] }) {
  const chapters = textData.chapters.flatMap((chapter) =>
    chapter.chunks.map((text, index) => ({
      chapter: chapter.chapter,
      chunk: index + 1,
      text,
    }))
  );

  function getCharacterProfile({ name }) {
    const appearances = Object.entries(research.entities)
      .filter(([, fields]) =>
        (fields["人物"] || []).some((item) => item.includes(name))
        || (fields[`${name}台词`] || []).some((item) => item && item !== "/")
      )
      .map(([chapter, fields]) => ({
        chapter,
        dialogue_samples: (fields[`${name}台词`] || []).filter((item) => item && item !== "/").slice(0, 2),
      }));
    const relations = uniqueBy(
      research.relations.filter((item) => item.a.includes(name) || item.b.includes(name)),
      relationLabel
    ).map((item) => ({
      relation: relationLabel(item),
      dialogue_count: item.dialogueCount,
      dialogue_chapters: item.dialogueChapters,
      evidence_id: `REL:${relationLabel(item)}`,
    }));
    const events = uniqueBy(
      research.relations.filter((item) => (item.a.includes(name) || item.b.includes(name)) && item.event),
      (item) => `${item.scene}:${item.event}`
    ).map((item) => ({
      scene: item.scene,
      event: item.event,
      evidence_id: `EVT:${item.scene}:${item.a}-${item.b}`,
    }));
    return {
      character: name,
      known_character: PRIMARY_CHARACTERS.includes(name) || appearances.length > 0,
      appearance_count: appearances.length,
      appearances: appearances.slice(0, 14),
      relations: relations.slice(0, 10),
      events: events.slice(0, 16),
      boundary: "人物身份与事件来自人工标注；性格、思想史意义和因果解释需结合原文细读。",
    };
  }

  function searchBackgroundKnowledge({ query, categories = [], top_k: topK = 5 }) {
    const ranked = (knowledgeData.entries || [])
      .filter((item) => !categories.length || categories.some((category) => item.category.includes(category)))
      .map((item) => {
        const searchable = `${item.category}${item.title}${(item.keywords || []).join("")}${item.summary}${item.details}`;
        return { item, score: relevance(searchable, query) };
      })
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "zh-CN"))
      .slice(0, topK);
    return {
      query,
      results: ranked.map(({ item, score }) => ({
        evidence_id: `KNOW:${item.id}`,
        category: item.category,
        title: item.title,
        score,
        summary: item.summary,
        details: item.details,
        source: item.source,
      })),
      boundary: "外部资料为权威来源的摘要性转述；版本异文、具体演出和学术争议仍应回到原始文献核验。",
    };
  }

  function searchPlayText({ query, chapters: chapterFilter = [], top_k: topK = 5 }) {
    const ranked = chapters
      .filter((item) => !chapterFilter.length || chapterFilter.some((name) => item.chapter.includes(name)))
      .map((item) => ({ ...item, score: relevance(item.text, query) }))
      .sort((a, b) => b.score - a.score || a.chapter.localeCompare(b.chapter, "zh-CN"))
      .slice(0, topK);
    return {
      query,
      results: ranked.map((item) => ({
        evidence_id: `TXT:${item.chapter}:${item.chunk}`,
        chapter: item.chapter,
        chunk: item.chunk,
        score: item.score,
        excerpt: item.text.slice(0, 520),
      })),
      boundary: "原文底本据用户说明来自国家图书馆藏本，具体版本书目信息仍待核验。",
    };
  }

  function searchProsody({ query, scenes = [], metric = "relevance", top_k: topK = 6 }) {
    const metricKey = {
      line_length_variation: "lineLengthCv",
      tone_alternation: "alternationRate",
      oblique_ratio: "obliqueRatio",
      rhyme_changes: "rhymeChanges",
    }[metric];
    const ranked = research.curves
      .filter((curve) => curve.primary)
      .filter((curve) => !scenes.length || scenes.includes(curve.scene))
      .map((curve) => {
        const searchable = `${curve.scene}${curve.chapter}${curve.tune}${curve.rhythmDescription}${curve.formEmotion}`;
        const semanticScore = relevance(searchable, query);
        const metricValue = metricKey === "rhymeChanges" ? curve.rhymeChanges : curve.metrics[metricKey];
        return { curve, score: metricKey ? Number(metricValue || 0) : semanticScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return {
      query,
      metric,
      results: ranked.map(({ curve, score }) => ({
        evidence_id: `CURVE:${curve.id}`,
        curve_id: curve.id,
        scene: curve.scene,
        chapter: curve.chapter,
        tune: curve.tune,
        score,
        tone_sequence: curve.toneSequence,
        line_lengths: curve.lineLengths,
        rhyme_changes: curve.rhymeChanges,
        metrics: curve.metrics,
        rhythm_description: curve.rhythmDescription,
        human_interpretation: curve.formEmotion,
      })),
      boundary: "形式指标支持比较与细读入口，不单独证明情感或叙事因果。",
    };
  }

  function compareScenes({ scenes }) {
    const results = scenes
      .map((scene) => research.sceneSummaries.find((item) => item.scene === scene))
      .filter(Boolean)
      .map((item) => ({
        evidence_id: `SCENE:${item.scene}`,
        scene: item.scene,
        chapter: item.chapter,
        curve_count: item.curveCount,
        metrics: item.metrics,
      }));
    return {
      results,
      boundary: "场景聚合会遮蔽单支曲词差异，解释时应继续调用 search_prosody 回到曲牌级证据。",
    };
  }

  function getRelationEvents({ character_a: characterA, character_b: characterB = "", top_k: topK = 8 }) {
    const results = research.relations
      .filter((item) => item.a.includes(characterA) || item.b.includes(characterA))
      .filter((item) => !characterB || item.a.includes(characterB) || item.b.includes(characterB))
      .filter((item) => item.event || item.relation)
      .slice(0, topK)
      .map((item) => ({
        evidence_id: `EVT:${item.scene}:${item.a}-${item.b}`,
        a: item.a,
        b: item.b,
        relation: item.relation,
        scene: item.scene,
        event: item.event,
        dialogue_count: item.dialogueCount,
        dialogue_chapters: item.dialogueChapters,
      }));
    return { results };
  }

  const handlers = {
    search_background_knowledge: searchBackgroundKnowledge,
    get_character_profile: getCharacterProfile,
    search_play_text: searchPlayText,
    search_prosody: searchProsody,
    compare_scenes: compareScenes,
    get_relation_events: getRelationEvents,
  };

  return {
    execute(name, args) {
      const handler = handlers[name];
      if (!handler) return { error: `Unknown research tool: ${name}` };
      return handler(args);
    },
  };
}
