import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "file:///C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const root = process.cwd();
const source = path.resolve(root, "../../working_materials/mudanting_source/1-《牡丹亭》数据收集.xlsx");
const output = path.resolve(root, "public/data/research.json");
const input = await FileBlob.load(source);
const workbook = await SpreadsheetFile.importXlsx(input);

const clean = (value) => value == null ? "" : String(value).replace(/\s+/g, " ").trim();
const number = (value) => {
  const text = clean(value);
  if (!text) return 0;
  return text.endsWith("%") ? Number.parseFloat(text) / 100 : Number.parseFloat(text) || 0;
};
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))];
const ffill = (rows, col) => {
  let current = "";
  return rows.map((row) => {
    if (clean(row[col])) current = clean(row[col]);
    return current;
  });
};
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const std = (xs) => {
  const m = mean(xs);
  return xs.length ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : 0;
};
const round = (x, digits = 3) => Number(x.toFixed(digits));
const sceneAliases = { "悼殇": "闹殇", "硬栲": "硬拷" };
const normalizeScene = (scene) => sceneAliases[clean(scene)] || clean(scene);
const sceneChapter = {
  "惊梦": "第拾出惊梦", "寻梦": "第拾贰出寻梦", "写真": "第拾肆出写真",
  "闹殇": "第贰拾出闹殇", "冥判": "第贰拾参出冥判", "拾画": "第贰拾肆出拾画",
  "回生": "第叁拾伍出回生", "婚走": "第参拾陆出婚走", "圆驾": "第伍拾伍出圆驾",
};
const primaryScenes = ["惊梦", "寻梦", "写真", "闹殇", "拾画", "回生", "婚走", "圆驾"];

const lyricSheet = workbook.worksheets.getItem("【导入】曲词分析");
const lyricRows = lyricSheet.getRange("A1:AD92").values;
const emotionHeaders = lyricRows[1].slice(9, 30).map(clean);
const lyricData = lyricRows.slice(2);
const scenes = ffill(lyricData, 1).map(normalizeScene);
const owners = ffill(lyricData, 0);

const curves = lyricData.flatMap((row, index) => {
  const tune = clean(row[2]);
  if (!tune) return [];
  const scene = scenes[index];
  const tones = [...clean(row[3]).matchAll(/[01]/g)].map((m) => Number(m[0]));
  const lengths = clean(row[6]).split(/[\/／、,\s]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  const rhymes = clean(row[4]).split(/[\/／、,\s]+/).map(clean).filter(Boolean);
  let alternations = 0;
  let longestRun = tones.length ? 1 : 0;
  let run = tones.length ? 1 : 0;
  tones.slice(1).forEach((tone, i) => {
    if (tone !== tones[i]) {
      alternations += 1;
      run = 1;
    } else {
      run += 1;
      longestRun = Math.max(longestRun, run);
    }
  });
  const emotions = Object.fromEntries(
    emotionHeaders.map((name, i) => [name, number(row[9 + i])]).filter(([, value]) => value > 0),
  );
  const positiveCodes = ["PA", "PE", "PD", "PH", "PG", "PB", "PK"];
  const positive = Object.entries(emotions).filter(([k]) => positiveCodes.some((c) => k.startsWith(c))).reduce((s, [, v]) => s + v, 0);
  const negative = Object.values(emotions).reduce((s, v) => s + v, 0) - positive;
  return [{
    id: `${scene}-${tune}-${index + 1}`,
    scene,
    chapter: sceneChapter[scene] || scene,
    tune,
    primary: primaryScenes.includes(scene),
    source: "人工标注",
    owner: owners[index],
    toneSequence: clean(row[3]),
    rhymeSequence: rhymes,
    rhymeChanges: number(row[5]),
    lineLengths: lengths,
    rhythmDescription: clean(row[7]),
    formEmotion: clean(row[8]),
    emotions,
    metrics: {
      characters: tones.length,
      obliqueRatio: round(tones.length ? tones.filter((x) => x === 1).length / tones.length : 0),
      alternationRate: round(tones.length > 1 ? alternations / (tones.length - 1) : 0),
      longestToneRun: longestRun,
      meanLineLength: round(mean(lengths), 2),
      lineLengthSd: round(std(lengths), 2),
      lineLengthCv: round(mean(lengths) ? std(lengths) / mean(lengths) : 0),
      lineCount: lengths.length,
      shortLongSpan: lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0,
      positiveEmotion: round(positive, 4),
      negativeEmotion: round(negative, 4),
    },
  }];
});

const plotRows = workbook.worksheets.getItem("【6.10更新】情节划分").getRange("A1:AG59").values.slice(2);
const parts = ffill(plotRows, 0);
const structures = ffill(plotRows, 1);
const chapters = plotRows.flatMap((row, i) => clean(row[2]) ? [{
  chapter: clean(row[2]).replace("悼殇", "闹殇").replace("硬栲", "硬拷"),
  part: parts[i],
  structure: structures[i],
  overview: clean(row[3]),
  loveLine: clean(row[4]),
  nationLine: clean(row[5]),
  plot: clean(row[7]),
  characterPlace: clean(row[8]),
  mainCharacters: clean(row[9]).split(/[、，,；;]/).map(clean).filter(Boolean),
  selectedLyrics: clean(row[10]),
  emotions: Object.fromEntries(
    lyricRows[1].slice(12, 33).map(clean).map((name, j) => [name, number(row[12 + j])]).filter(([, value]) => value > 0),
  ),
}] : []);

const entityRows = workbook.worksheets.getItem("【导入】实体整理2.0").getRange("A1:M803").values.slice(1);
const entityChapters = ffill(entityRows, 0).map((x) => x.replace("悼殇", "闹殇").replace("硬栲", "硬拷"));
const entityColumns = ["人物", "服饰", "建筑", "地点", "意象", "物品", "情感词", "时间", "空间", "杜丽娘台词", "柳梦梅台词", "其他人台词"];
const entities = {};
entityRows.forEach((row, i) => {
  const chapter = entityChapters[i];
  if (!chapter) return;
  entities[chapter] ||= Object.fromEntries(entityColumns.map((name) => [name, []]));
  entityColumns.forEach((name, j) => {
    const value = clean(row[j + 1]);
    if (value) entities[chapter][name].push(value);
  });
});
Object.values(entities).forEach((record) => {
  Object.keys(record).forEach((key) => { record[key] = unique(record[key]); });
});

const relationRows = workbook.worksheets.getItem("【导入】人物社会关系").getRange("A1:G179").values.slice(1);
const roleA = ffill(relationRows, 0);
const roleB = ffill(relationRows, 1);
const relationType = ffill(relationRows, 2);
const counts = ffill(relationRows, 3);
const chapterCounts = ffill(relationRows, 4);
const relations = relationRows.flatMap((row, i) => {
  if (!roleA[i] || !roleB[i]) return [];
  return [{
    a: roleA[i], b: roleB[i], relation: relationType[i],
    dialogueCount: number(counts[i]), dialogueChapters: number(chapterCounts[i]),
    event: clean(row[5]), scene: normalizeScene(row[6]),
  }];
});

const sceneSummaries = primaryScenes.map((scene) => {
  const rows = curves.filter((curve) => curve.scene === scene);
  const aggregate = (key) => round(mean(rows.map((row) => row.metrics[key])), key === "meanLineLength" ? 2 : 3);
  return {
    scene,
    chapter: sceneChapter[scene],
    curveCount: rows.length,
    withHumanInterpretation: rows.filter((row) => row.formEmotion).length,
    withEmotionVector: rows.filter((row) => Object.keys(row.emotions).length).length,
    metrics: {
      obliqueRatio: aggregate("obliqueRatio"),
      alternationRate: aggregate("alternationRate"),
      meanLineLength: aggregate("meanLineLength"),
      lineLengthCv: aggregate("lineLengthCv"),
      rhymeChanges: round(mean(rows.map((row) => row.rhymeChanges)), 2),
      positiveEmotion: aggregate("positiveEmotion"),
      negativeEmotion: aggregate("negativeEmotion"),
    },
  };
});

const payload = {
  meta: {
    title: "曲情证：《牡丹亭》格律与“至情”研究智能体",
    researchQuestion: "格律形式如何参与《牡丹亭》“至情”表达？",
    generatedAt: new Date().toISOString(),
    provenance: [
      { dataset: "曲词格律、形式—情感关联、实体与人物关系", source: "用户提供工作簿", method: "人工标注；程序规范化与派生计算" },
      { dataset: "原文", source: "用户提供 Word；据用户说明，底本来自国家图书馆藏《牡丹亭还魂记》", method: "版本信息待进一步核验" },
      { dataset: "词汇情感趋势", source: "工作簿注明：历史人文大数据平台", method: "保留原始数值并统一百分比格式" },
    ],
    scope: { allCurves: curves.length, primaryCurves: curves.filter((x) => x.primary).length, primaryScenes },
  },
  curves,
  sceneSummaries,
  chapters,
  entities,
  relations,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(payload), "utf8");
console.log(JSON.stringify({
  output, curves: curves.length, primaryCurves: curves.filter((x) => x.primary).length,
  chapters: chapters.length, entityChapters: Object.keys(entities).length, relations: relations.length,
}, null, 2));
