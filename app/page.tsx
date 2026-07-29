"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, ChevronLeft, ChevronRight, CircleHelp, Database,
  FlaskConical, GitCompareArrows, Menu, MessageSquareText, Network, Play,
  Search, Sparkles, X,
} from "lucide-react";
import { runEvidenceAgent } from "../lib/client-agent";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const agentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL || "";

type Metrics = {
  obliqueRatio: number; alternationRate: number; longestToneRun: number;
  meanLineLength: number; lineLengthSd: number; lineLengthCv: number;
  lineCount: number; shortLongSpan: number; positiveEmotion: number; negativeEmotion: number;
};
type Curve = {
  id: string; scene: string; chapter: string; tune: string; primary: boolean;
  toneSequence: string; rhymeSequence: string[]; rhymeChanges: number;
  lineLengths: number[]; rhythmDescription: string; formEmotion: string;
  emotions: Record<string, number>; metrics: Metrics;
};
type SceneSummary = { scene: string; chapter: string; curveCount: number; withHumanInterpretation: number; withEmotionVector: number; metrics: Metrics & { rhymeChanges: number } };
type ResearchData = {
  meta: { title: string; researchQuestion: string; provenance: { dataset: string; source: string; method: string }[]; scope: { allCurves: number; primaryCurves: number; primaryScenes: string[] } };
  curves: Curve[]; sceneSummaries: SceneSummary[];
  entities: Record<string, Record<string, string[]>>;
  relations: { a: string; b: string; relation: string; dialogueCount: number; dialogueChapters: number; event: string; scene: string }[];
};
type AgentReply = {
  answer: string; mode: string;
  citations: { id: string; label: string; excerpt: string }[];
  tools: { name: string; detail: string }[];
};

const mechanismCards = [
  { n: "01", title: "节奏伸缩", text: "长短句的扩张与骤收，把情感从铺陈推向停顿、迟疑或决断。", metric: "句长变异系数" },
  { n: "02", title: "声调压力", text: "平仄密度、连续与交替，调节曲词的阻滞感、急迫感与回旋感。", metric: "仄声比 · 交替率" },
  { n: "03", title: "韵脚转折", text: "换韵不是装饰：它常与心理转向、场景切换和语势收束共同发生。", metric: "换韵次数" },
];

const presentationSlides = [
  { kicker: "01 · 从材料出发", title: "我先有一批“读过”的数据。", body: "一部五十五出原文、八十支人工核验曲词、人物与关系事件，是模型工作的底座。程序没有替代我的阅读，而是把既有阅读整理成可检索、可比较的知识层。", foot: "Word原文 · Excel人工标注 · 80支曲 · 8个关键场景" },
  { kicker: "02 · 提出人文问题", title: "格律形式，如何参与“至情”表达？", body: "主线不是判断某种格律等于某种情绪，而是观察句式伸缩、平仄压力和换韵转折怎样组织情感进程；杜丽娘历程与人物关系作为解释语境。", foot: "主线 A：形式—情感机制｜补充 B：丽娘历程｜补充 C：人物关系" },
  { kicker: "03 · 构建智能体", title: "四层知识，三条问答路径。", body: "权威基础知识解决“杜丽娘是谁”；五十五出全文解决出处与语境；人工标注和计算指标解决专题研究。问题路由器让 DeepSeek 自动选择知识检索、原文检索或格律工具。", foot: "权威知识库 → 问题路由 → RAG/工具调用 → 带来源回答" },
  { kicker: "04 · 形成发现", title: "形式不是情感标签，而是组织方式。", body: "句式伸缩控制铺陈与骤收，平仄配置调节压力与回旋，换韵协同心理和场景转折。弱全局相关提醒我们：结论必须回到曲牌、叙事位置和原文细读。", foot: "计算用于发现线索，人文判断负责解释；不把相关性包装成因果" },
  { kicker: "05 · 完成转变", title: "文科生，也可以成为大模型架构师。", body: "架构不是只会写代码，而是能定义问题、设计数据结构、规定证据边界、测试回答质量，并把模型变成可用产品。我把人文判断放在系统最上游，也放在评测的最后一关。", foot: "问题定义 · 数据治理 · RAG与Agent · 评测 · 部署" },
];

function metricLabel(key: string) {
  return ({ obliqueRatio: "仄声比", alternationRate: "平仄交替率", meanLineLength: "平均句长", lineLengthCv: "句长变异", rhymeChanges: "平均换韵" } as Record<string, string>)[key] || key;
}
function fmt(value: number, percent = false) {
  return percent ? `${Math.round(value * 100)}%` : Number(value || 0).toFixed(2);
}

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, index) => chunk.startsWith("**") && chunk.endsWith("**")
    ? <strong key={index}>{chunk.slice(2, -2)}</strong>
    : <span key={index}>{chunk}</span>);
}

function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inlineText(item)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((line) => {
    if (/^[-—]{3,}$/.test(line)) return;
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, "")); return; }
    flushList();
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push(<h4 key={`head-${blocks.length}`}>{inlineText(line.replace(/^#{1,3}\s+/, ""))}</h4>);
    } else if (/^\|.+\|$/.test(line) && !/^-/.test(line.replace(/\|/g, "").trim())) {
      blocks.push(<p className="answer-row" key={`row-${blocks.length}`}>{inlineText(line.split("|").filter(Boolean).join(" · "))}</p>);
    } else {
      blocks.push(<p key={`para-${blocks.length}`}>{inlineText(line)}</p>);
    }
  });
  flushList();
  return <div className="answer-text">{blocks}</div>;
}

export default function Home() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [scene, setScene] = useState("惊梦");
  const [curveId, setCurveId] = useState("");
  const [query, setQuery] = useState("为什么说句式长短变化参与了杜丽娘的“至情”表达？");
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { fetch(`${basePath}/data/research.json`).then((r) => r.json()).then(setData); }, []);
  useEffect(() => {
    if (!data) return;
    const first = data.curves.find((x) => x.primary && x.scene === scene);
    if (first) setCurveId(first.id);
  }, [data, scene]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!presenting) return;
      if (event.key === "ArrowRight" || event.key === " ") setSlide((x) => Math.min(x + 1, presentationSlides.length - 1));
      if (event.key === "ArrowLeft") setSlide((x) => Math.max(x - 1, 0));
      if (event.key === "Escape") setPresenting(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presenting]);

  const summary = data?.sceneSummaries.find((x) => x.scene === scene);
  const sceneCurves = useMemo(() => data?.curves.filter((x) => x.primary && x.scene === scene) || [], [data, scene]);
  const curve = sceneCurves.find((x) => x.id === curveId) || sceneCurves[0];
  const toneBlocks = useMemo(() => curve?.toneSequence.match(/\[[^\]]+\]/g)?.map((block) => block.match(/[01]/g)?.map(Number) || []) || [], [curve]);
  const topRelations = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return data.relations.filter((x) => {
      const key = `${x.a}|${x.b}`;
      if (seen.has(key) || !x.dialogueCount) return false;
      seen.add(key); return true;
    }).sort((a, b) => b.dialogueCount - a.dialogueCount).slice(0, 6);
  }, [data]);

  async function askAgent(nextQuery = query) {
    if (!nextQuery.trim() || !data) return;
    setLoading(true); setReply(null); setQuery(nextQuery);
    try {
      if (agentApiUrl) {
        try {
          const response = await fetch(`${agentApiUrl.replace(/\/$/, "")}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({ question: nextQuery, history }),
          });
          if (!response.ok) throw new Error(`Agent API ${response.status}`);
          const nextReply = await response.json() as AgentReply;
          setReply(nextReply);
          setHistory((items) => [...items, { role: "user" as const, content: nextQuery }, { role: "assistant" as const, content: nextReply.answer }].slice(-8));
          return;
        } catch {
          // Keep the presentation usable when the public model endpoint is unavailable.
        }
      }
      const text = await fetch(`${basePath}/data/text.json`).then((response) => response.json());
      const nextReply = runEvidenceAgent(nextQuery, data, text);
      setReply(nextReply);
      setHistory((items) => [...items, { role: "user" as const, content: nextQuery }, { role: "assistant" as const, content: nextReply.answer }].slice(-8));
    } finally { setLoading(false); }
  }

  if (!data) return <main className="loading-screen"><div className="seal">曲</div><p>正在展开曲词证据……</p></main>;

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top"><span className="brand-mark">曲</span><span>曲情证<small>牡丹亭研究智能体</small></span></a>
        <button className="nav-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="展开导航"><Menu /></button>
        <div className={`nav-links ${mobileNav ? "open" : ""}`}>
          <a href="#foundation">数据与架构</a><a href="#finding">核心发现</a><a href="#agent">智能体</a><a href="#method">方法边界</a>
        </div>
        <button className="button ghost nav-present" onClick={() => { setSlide(0); setPresenting(true); }}><Play size={15} /> 两分钟汇报</button>
      </nav>

      <header className="hero" id="top">
        <div className="hero-grain" />
        <div className="hero-painting" aria-hidden="true"><img src={`${basePath}/images/liniang-peony.png`} alt="" /></div>
        <div className="eyebrow"><span>数字人文 · 可解释大模型应用</span><span className="line" /></div>
        <h1>格律形式，如何参与<br /><em>“至情”</em>表达？</h1>
        <p className="hero-lead">以《牡丹亭》80支人工核验曲词为核心，把平仄、句式与韵脚变成可比较证据；再由研究智能体返回原文，完成“量化发现—细读解释—出处核验”的闭环。</p>
        <div className="hero-actions">
          <a className="button primary" href="#evidence">进入证据台 <ArrowRight size={17} /></a>
          <button className="button paper" onClick={() => askAgent("请用三条证据解释：格律形式如何参与《牡丹亭》的“至情”表达？")}>让智能体先回答 <Sparkles size={16} /></button>
        </div>
        <div className="hero-stats">
          <div><strong>80</strong><span>支主研究曲词</span></div><div><strong>8</strong><span>个关键情感场景</span></div><div><strong>55</strong><span>出原文可追溯</span></div><div><strong>178</strong><span>条关系事件</span></div>
        </div>
        <div className="hero-note"><BookOpen size={15} /> 人工判断在前，模型综合在后</div>
      </header>

      <section className="section foundation" id="foundation">
        <div className="section-heading">
          <span className="section-index">01 / 数据与架构</span>
          <h2>先把阅读变成<em>知识底座</em>，<br />再让模型工作。</h2>
          <p>“通用”不等于让大模型自由发挥，而是为不同问题准备不同层级的材料与工具。</p>
        </div>
        <div className="knowledge-layers">
          <article><span>Ⅰ</span><h3>权威基础知识</h3><p>作者、人物、情节、昆曲、思想史与传播；来源于非遗机构、高校和学术论文。</p><small>回答“杜丽娘是谁”等通识问题</small></article>
          <article><span>Ⅱ</span><h3>五十五出全文</h3><p>保留出目与文本上下文，可检索人物、名句、唱词及具体情节。</p><small>回答出处与原文问题</small></article>
          <article><span>Ⅲ</span><h3>人工核验曲词</h3><p>八十支曲的平仄、句长、韵脚和“形式—情感”解释，均可回到原始记录。</p><small>回答格律研究问题</small></article>
          <article><span>Ⅳ</span><h3>关系与计算层</h3><p>人物事件、场景比较与派生指标，让跨场景观察保持可追溯。</p><small>提供比较与细读线索</small></article>
        </div>
        <div className="architecture-flow">
          <strong>用户问题</strong><i>→</i><span>问题路由</span><i>→</i><span>知识／原文／格律工具</span><i>→</i><span>DeepSeek 综合</span><i>→</i><strong>带来源回答</strong>
        </div>
      </section>

      <section className="section finding" id="finding">
        <div className="section-heading">
          <span className="section-index">02 / 核心发现</span>
          <h2>“至情”不只被写出来，<br />也被<em>组织</em>出来。</h2>
          <p>这里不把某一种格律机械对应某一种情绪，而是观察形式如何控制情感的速度、压力和转向。</p>
        </div>
        <div className="mechanism-grid">
          {mechanismCards.map((card) => <article className="mechanism" key={card.n}>
            <div className="mechanism-top"><span>{card.n}</span><FlaskConical size={18} /></div>
            <h3>{card.title}</h3><p>{card.text}</p><small>{card.metric}</small>
          </article>)}
        </div>
        <div className="claim-strip"><span>研究主张</span><p>格律不是情感的静态标签，而是“至情”叙事中的动态装置：它让情感得以铺陈、受阻、转折，并最终跨越生死与礼法边界。</p></div>
        <div className="finding-stat"><strong>|r| ≤ 0.16</strong><p>在有词汇情感向量的60支曲中，单一形式指标与正／负情感总量的全局线性相关都很弱。这不是“没有关系”，而是提示：形式—情感关系依赖曲牌、场景和叙事位置，必须结合人工细读解释。</p></div>
      </section>

      <section className="section evidence" id="evidence">
        <div className="section-heading compact">
          <span className="section-index">03 / 曲词证据台</span>
          <h2>先看全局，再回到一支曲。</h2>
          <p>所有指标由人工标注的平仄、句式与韵脚派生；点击曲牌即可核对原始序列与人工解释。</p>
        </div>
        <div className="scene-tabs" role="tablist">
          {data.meta.scope.primaryScenes.map((name) => <button key={name} className={scene === name ? "active" : ""} onClick={() => setScene(name)}>{name}</button>)}
        </div>
        {summary && <div className="evidence-layout">
          <div className="panel overview-panel">
            <div className="panel-title"><div><span>{summary.chapter}</span><h3>{scene}：形式指纹</h3></div><span className="count">{summary.curveCount} 支曲</span></div>
            <div className="metric-row">
              <Metric label="仄声比" value={fmt(summary.metrics.obliqueRatio, true)} note="声调压力" />
              <Metric label="交替率" value={fmt(summary.metrics.alternationRate, true)} note="节奏起伏" />
              <Metric label="句长变异" value={fmt(summary.metrics.lineLengthCv)} note="伸缩幅度" />
              <Metric label="平均换韵" value={fmt(summary.metrics.rhymeChanges)} note="语势转折" />
            </div>
            <div className="chart-wrap"><SceneLinesChart data={data.sceneSummaries} /></div>
            <div className="chart-caption"><GitCompareArrows size={15} /> 八个场景的形式轨迹，可作为杜丽娘情感历程的叙事框架。</div>
          </div>
          <div className="panel curve-list">
            <div className="panel-title"><div><span>场景内比较</span><h3>选择一支曲牌细读</h3></div></div>
            <div className="curve-scroll">
              {sceneCurves.map((item) => <button key={item.id} className={curve?.id === item.id ? "active" : ""} onClick={() => setCurveId(item.id)}>
                <strong>【{item.tune}】</strong><span>{item.rhythmDescription || "人工格律标注"}</span><i>{fmt(item.metrics.lineLengthCv)}</i>
              </button>)}
            </div>
          </div>
        </div>}

        {curve && <article className="close-reading">
          <div className="reading-head"><div><span>MICRO READING</span><h3>【{curve.tune}】形式细读</h3></div><button onClick={() => askAgent(`请分析${curve.scene}【${curve.tune}】的格律形式如何参与情感表达，并给出原文证据。`)}><Sparkles size={15} /> 交给智能体</button></div>
          <div className="tone-score">
            {toneBlocks.map((block, i) => <div className="tone-line" key={i}>{block.map((tone, j) => <span title={tone ? "仄" : "平"} className={tone ? "ze" : "ping"} key={j}>{tone ? "仄" : "平"}</span>)}</div>)}
          </div>
          <div className="reading-grid">
            <div><small>句式</small><strong>{curve.lineLengths.join(" / ")}</strong><p>{curve.rhythmDescription}</p></div>
            <div><small>韵脚与换韵</small><strong>{curve.rhymeSequence.join(" / ") || "未标"}</strong><p>换韵 {curve.rhymeChanges} 次</p></div>
            <div className="human-note"><small>人工“形式—情感”判断</small><p>{curve.formEmotion || "此曲未提供人工解释。"}</p></div>
          </div>
        </article>}
      </section>

      <section className="section narrative">
        <div className="section-heading compact">
          <span className="section-index">04 / 补充叙事</span>
          <h2>用形式轨迹重读杜丽娘。</h2>
          <p>人物历程与关系网络不另起炉灶，而是帮助解释形式为何在此刻发生变化。</p>
        </div>
        <div className="narrative-grid">
          <article className="panel journey">
            <div className="panel-title"><div><span>B · 情感历程</span><h3>从惊梦到圆驾</h3></div></div>
            <div className="journey-chart"><JourneyBars data={data.sceneSummaries} /></div>
            <p className="soft-note">这条轨迹是“重读入口”，不是单一因果证明；点击上方场景可回到曲牌级证据。</p>
          </article>
          <article className="panel relations">
            <div className="panel-title"><div><span>C · 人物关系</span><h3>情如何穿过社会结构</h3></div><Network size={20} /></div>
            <div className="relation-list">
              {topRelations.map((item, i) => <div className="relation-row" key={`${item.a}-${item.b}`}>
                <span className="rank">{String(i + 1).padStart(2, "0")}</span><div><strong>{item.a}<i>—{item.relation}—</i>{item.b}</strong><small>{item.dialogueCount} 次对话 · {item.dialogueChapters} 个章节</small></div>
              </div>)}
            </div>
          </article>
        </div>
      </section>

      <section className="section agent-section" id="agent">
        <div className="agent-intro">
          <span className="section-index">05 / 通用知识与研究问答</span>
          <h2>既能讲清人物与情节，<br />也能回到<em>曲词与原文</em>。</h2>
          <p>智能体会判断问题类型：通识问题自然讲解，出处问题检索全文，格律问题调用人工标注与计算工具。不同问题使用不同证据规则。</p>
          <div className="research-contract">
            <article><span>01</span><strong>先分问题</strong><small>通识、原文、关系或研究</small></article>
            <article><span>02</span><strong>再找材料</strong><small>权威知识、全文或项目数据</small></article>
            <article><span>03</span><strong>保留边界</strong><small>指标不冒充因果</small></article>
          </div>
          <div className="tool-chips"><span><BookOpen />知识</span><span><Search />原文</span><span><FlaskConical />格律</span><span><GitCompareArrows />场景</span><span><Network />人物</span></div>
        </div>
        <div className="agent-console">
          <div className="console-top">
            <div><span className="console-kicker">曲情问答</span><strong>《牡丹亭》研究助手</strong></div>
            <small><i /> {agentApiUrl ? "模型服务已连接" : "本地证据模式"}</small>
          </div>
          <div className="agent-prompt-label">可以问“杜丽娘是谁”，也可以追问一支曲怎样组织情感</div>
          <div className="suggestions">
            {["杜丽娘是谁？请结合她的情感历程回答", "比较“惊梦”和“回生”的形式差异", "哪几支曲的句式伸缩最明显？", "如何证明格律参与了“至情”表达？"].map((text) => <button key={text} onClick={() => askAgent(text)}>{text}</button>)}
          </div>
          <div className="ask-box"><MessageSquareText size={18} /><textarea aria-label="研究问题" placeholder="例如：杜丽娘是谁？她的“至情”如何被格律组织？" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAgent(); } }} /><button onClick={() => askAgent()} disabled={loading}>{loading ? "正在查找…" : "提交问题"} <ArrowRight size={15} /></button></div>
          <div className="agent-answer">
            {!reply && !loading && <div className="answer-empty"><BookOpen /><strong>等待一个值得细读的问题</strong><p>回答会区分结论、依据与解释边界，并列出实际使用的材料。</p></div>}
            {loading && <div className="thinking"><span /><span /><span /> 正在检索人物、曲牌与原文</div>}
            {reply && <>
              <div className="answer-mode"><span>{reply.mode.includes("general") ? "通识知识＋权威来源" : reply.mode.startsWith("llm") ? "大模型＋研究工具" : "本地证据模式"}</span><span>{reply.citations.length} 条材料</span></div>
              <FormattedAnswer text={reply.answer} />
              <details className="tool-trace"><summary>本次回答如何形成</summary>{reply.tools.map((tool) => <div key={tool.name}><strong>{tool.name}</strong><span>{tool.detail}</span></div>)}</details>
              <div className="citation-list">{reply.citations.map((citation) => <article key={citation.id}><span>{citation.id}</span><div><strong>{citation.label}</strong><p>{citation.excerpt}</p></div></article>)}</div>
            </>}
          </div>
        </div>
      </section>

      <section className="section method" id="method">
        <div className="section-heading compact"><span className="section-index">06 / 方法与边界</span><h2>优秀，不靠“像真的”。</h2><p>把人工、程序与模型各自做了什么说清楚，本身就是数字人文成果的一部分。</p></div>
        <div className="method-grid">
          {data.meta.provenance.map((item, i) => <article key={item.dataset}><span>0{i + 1}</span><h3>{item.dataset}</h3><p>{item.source}</p><small>{item.method}</small></article>)}
          <article className="boundary"><CircleHelp /><h3>解释边界</h3><p>当前结果是描述性探索与计算辅助细读，不把统计相关直接写成历史因果；版本书目信息仍需核验。</p></article>
        </div>
      </section>

      <footer><div className="brand"><span className="brand-mark">曲</span><span>曲情证<small>格律形式 × 至情表达</small></span></div><p>以可计算形式为入口，以可追溯原文为底线。</p><button onClick={() => { setSlide(0); setPresenting(true); }}><Play size={14} /> 开始两分钟汇报</button></footer>

      {presenting && <div className="presentation">
        <button className="close-present" onClick={() => setPresenting(false)}><X /></button>
        <div className="present-brand">曲情证 · TWO-MINUTE STORY</div>
        <div className="slide-count">{slide + 1} / {presentationSlides.length}</div>
        <article>
          <span>{presentationSlides[slide].kicker}</span>
          <h2>{presentationSlides[slide].title}</h2>
          <p>{presentationSlides[slide].body}</p>
          <small>{presentationSlides[slide].foot}</small>
        </article>
        <div className="present-controls">
          <button onClick={() => setSlide((x) => Math.max(0, x - 1))} disabled={slide === 0}><ChevronLeft /></button>
          <div>{presentationSlides.map((_, i) => <i key={i} className={i === slide ? "active" : ""} />)}</div>
          <button onClick={() => setSlide((x) => Math.min(presentationSlides.length - 1, x + 1))} disabled={slide === presentationSlides.length - 1}><ChevronRight /></button>
        </div>
      </div>}
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function SceneLinesChart({ data }: { data: SceneSummary[] }) {
  const x = (i: number) => 48 + i * 94;
  const y = (value: number) => 205 - value / .7 * 170;
  const line = (key: "lineLengthCv" | "alternationRate") => data.map((item, i) => `${x(i)},${y(item.metrics[key])}`).join(" ");
  return <svg className="native-chart" viewBox="0 0 760 240" role="img" aria-label="八个场景的句长变异与平仄交替率">
    {[.2, .4, .6].map((v) => <g key={v}><line x1="38" x2="735" y1={y(v)} y2={y(v)} /><text x="7" y={y(v) + 4}>{v}</text></g>)}
    <polyline className="chart-red" points={line("lineLengthCv")} />
    <polyline className="chart-jade" points={line("alternationRate")} />
    {data.map((item, i) => <g key={item.scene}>
      <circle className="dot-red" cx={x(i)} cy={y(item.metrics.lineLengthCv)} r="4"><title>{item.scene} 句长变异 {item.metrics.lineLengthCv}</title></circle>
      <circle className="dot-jade" cx={x(i)} cy={y(item.metrics.alternationRate)} r="3"><title>{item.scene} 交替率 {item.metrics.alternationRate}</title></circle>
      <text className="scene-label" x={x(i)} y="230" textAnchor="middle">{item.scene}</text>
    </g>)}
  </svg>;
}

function JourneyBars({ data }: { data: SceneSummary[] }) {
  const x = (i: number) => 42 + i * 78;
  const maxRhyme = Math.max(...data.map((item) => item.metrics.rhymeChanges));
  return <svg className="native-chart" viewBox="0 0 660 260" role="img" aria-label="八个场景的句长变异与平均换韵">
    {[60, 120, 180, 230].map((v) => <line key={v} x1="25" x2="640" y1={v} y2={v} />)}
    {data.map((item, i) => {
      const cvHeight = item.metrics.lineLengthCv / .7 * 185;
      const rhymeHeight = item.metrics.rhymeChanges / maxRhyme * 185;
      return <g key={item.scene}>
        <rect className="bar-red" x={x(i)} y={225 - cvHeight} width="18" height={cvHeight}><title>{item.scene} 句长变异 {item.metrics.lineLengthCv}</title></rect>
        <rect className="bar-gold" x={x(i) + 20} y={225 - rhymeHeight} width="18" height={rhymeHeight}><title>{item.scene} 平均换韵 {item.metrics.rhymeChanges}</title></rect>
        <text className="scene-label" x={x(i) + 18} y="248" textAnchor="middle">{item.scene}</text>
      </g>;
    })}
  </svg>;
}
