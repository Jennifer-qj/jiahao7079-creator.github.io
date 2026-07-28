"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, ChevronLeft, ChevronRight, CircleHelp, Database,
  FlaskConical, GitCompareArrows, Menu, MessageSquareText, Network, Play,
  Search, Sparkles, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

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
  { kicker: "研究问题", title: "格律形式，如何参与“至情”表达？", body: "我没有让模型替我解释《牡丹亭》，而是把80支人工核验曲词转成可比较的形式指标，再让智能体回到原文寻找证据。", foot: "主线 A：形式—情感机制｜补充 B：丽娘情感历程｜补充 C：人物关系" },
  { kicker: "方法", title: "人工标注 × 可计算格律 × 可追溯原文", body: "每支曲同时保留平仄、句长、韵脚、人工“形式—情感”判断和词汇情感向量。程序只做规范化与派生计算，所有结论都能回到曲牌与原文片段。", foot: "80支曲 · 8个关键场景 · 55出原文 · 178条关系事件" },
  { kicker: "发现", title: "形式不是情感的标签，而是情感的组织方式", body: "句式伸缩组织情感推进；平仄配置调节压力与回旋；换韵协同心理转折。三者共同把“情”从春心初动，推向死生跨越，再收束为礼法承认。", foot: "描述性证据，不把相关性包装成因果" },
  { kicker: "成果", title: "“曲情证”研究智能体", body: "它不是泛泛聊天：会先判断问题，再调用曲牌度量、场景比较、原文检索或人物关系工具，最后给出带出处的回答。研究者可以追问、核对，也可以发现值得重读的曲词。", foot: "人文判断在前，模型综合在后；可复核，也可扩展" },
];

function metricLabel(key: string) {
  return ({ obliqueRatio: "仄声比", alternationRate: "平仄交替率", meanLineLength: "平均句长", lineLengthCv: "句长变异", rhymeChanges: "平均换韵" } as Record<string, string>)[key] || key;
}
function fmt(value: number, percent = false) {
  return percent ? `${Math.round(value * 100)}%` : Number(value || 0).toFixed(2);
}

export default function Home() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [scene, setScene] = useState("惊梦");
  const [curveId, setCurveId] = useState("");
  const [query, setQuery] = useState("为什么说句式长短变化参与了杜丽娘的“至情”表达？");
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { fetch("/data/research.json").then((r) => r.json()).then(setData); }, []);
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
    if (!nextQuery.trim()) return;
    setLoading(true); setReply(null); setQuery(nextQuery);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: nextQuery }) });
      setReply(await response.json());
    } finally { setLoading(false); }
  }

  if (!data) return <main className="loading-screen"><div className="seal">曲</div><p>正在展开曲词证据……</p></main>;

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top"><span className="brand-mark">曲</span><span>曲情证<small>牡丹亭研究智能体</small></span></a>
        <button className="nav-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="展开导航"><Menu /></button>
        <div className={`nav-links ${mobileNav ? "open" : ""}`}>
          <a href="#finding">核心发现</a><a href="#evidence">证据台</a><a href="#agent">研究智能体</a><a href="#method">数据说明</a>
        </div>
        <button className="button ghost nav-present" onClick={() => { setSlide(0); setPresenting(true); }}><Play size={15} /> 两分钟汇报</button>
      </nav>

      <header className="hero" id="top">
        <div className="hero-grain" />
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

      <section className="section finding" id="finding">
        <div className="section-heading">
          <span className="section-index">01 / 核心发现</span>
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
          <span className="section-index">02 / 曲词证据台</span>
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
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.sceneSummaries}>
                  <CartesianGrid stroke="#ded8cb" vertical={false} />
                  <XAxis dataKey="scene" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 0.7]} />
                  <Tooltip contentStyle={{ borderRadius: 0, borderColor: "#c9c0b1" }} />
                  <Line type="monotone" dataKey="metrics.lineLengthCv" name="句长变异" stroke="#9b2c2c" strokeWidth={3} dot={{ fill: "#9b2c2c" }} />
                  <Line type="monotone" dataKey="metrics.alternationRate" name="平仄交替率" stroke="#2f6658" strokeWidth={2} dot={{ fill: "#2f6658" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
          <span className="section-index">03 / 补充叙事</span>
          <h2>用形式轨迹重读杜丽娘。</h2>
          <p>人物历程与关系网络不另起炉灶，而是帮助解释形式为何在此刻发生变化。</p>
        </div>
        <div className="narrative-grid">
          <article className="panel journey">
            <div className="panel-title"><div><span>B · 情感历程</span><h3>从惊梦到圆驾</h3></div></div>
            <div className="journey-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.sceneSummaries}>
                  <CartesianGrid stroke="#e1dbcf" vertical={false} />
                  <XAxis dataKey="scene" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="metrics.lineLengthCv" name="句长变异" fill="#9b2c2c" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="metrics.rhymeChanges" name="平均换韵" fill="#d2a85d" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
          <span className="section-index light">04 / 研究智能体</span>
          <h2>不只回答，<br />还要告诉你<em>证据从哪来</em>。</h2>
          <p>智能体会先识别任务，再调用曲牌度量、场景比较、原文检索或人物关系工具。即使没有外接大模型，也能给出基于证据的结构化回答。</p>
          <div className="tool-chips"><span><Search />原文检索</span><span><FlaskConical />格律度量</span><span><GitCompareArrows />场景比较</span><span><Network />关系查询</span></div>
        </div>
        <div className="agent-console">
          <div className="console-top"><span><i /> 证据型 Agent</span><small>RAG · TOOL USE · CITATION</small></div>
          <div className="suggestions">
            {["比较“惊梦”和“回生”的形式差异", "哪几支曲的句式伸缩最明显？", "杜丽娘与柳梦梅的关系如何推进？"].map((text) => <button key={text} onClick={() => askAgent(text)}>{text}</button>)}
          </div>
          <div className="ask-box"><MessageSquareText size={19} /><textarea value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAgent(); } }} /><button onClick={() => askAgent()} disabled={loading}>{loading ? "检索中…" : "提问"} <ArrowRight size={15} /></button></div>
          <div className="agent-answer">
            {!reply && !loading && <div className="answer-empty"><Sparkles /><p>输入一个研究问题。回答将附带工具轨迹与可核对出处。</p></div>}
            {loading && <div className="thinking"><span /><span /><span /> 正在选择工具并检索证据</div>}
            {reply && <>
              <div className="answer-mode">{reply.mode === "llm" ? "大模型综合" : "本地证据综合"} · {reply.citations.length} 条引证</div>
              <div className="answer-text">{reply.answer.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
              <details className="tool-trace"><summary>查看 Agent 调用了什么</summary>{reply.tools.map((tool) => <div key={tool.name}><strong>{tool.name}</strong><span>{tool.detail}</span></div>)}</details>
              <div className="citation-list">{reply.citations.map((citation) => <article key={citation.id}><span>{citation.id}</span><div><strong>{citation.label}</strong><p>{citation.excerpt}</p></div></article>)}</div>
            </>}
          </div>
        </div>
      </section>

      <section className="section method" id="method">
        <div className="section-heading compact"><span className="section-index">05 / 数据与边界</span><h2>优秀，不靠“像真的”。</h2><p>把人工、程序与模型各自做了什么说清楚，本身就是数字人文成果的一部分。</p></div>
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
