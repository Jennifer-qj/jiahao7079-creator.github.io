from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "《从人文问题到大模型架构——曲情证项目报告》.docx"
BLUE = "2E74B5"
DARK_BLUE = "1F4D78"
LIGHT = "F4F6F9"
GRAY = "666666"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size=None, bold=None, color=None, italic=None):
    run.font.name = "Calibri"
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "等线")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_para(doc, text="", *, size=11, bold=False, color=None, align=None, before=0, after=8, line=1.333, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = line
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    set_run_font(r, size=size, bold=bold, color=color, italic=italic)
    return p


def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.375)
    p.paragraph_format.first_line_indent = Inches(-0.194)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.208
    set_run_font(p.add_run(text), size=11)
    return p


def add_number(doc, text):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.left_indent = Inches(0.375)
    p.paragraph_format.first_line_indent = Inches(-0.194)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.208
    set_run_font(p.add_run(text), size=11)
    return p


def add_heading(doc, text, level=1):
    specs = {
        1: (16, BLUE, 18, 10),
        2: (13, BLUE, 12, 6),
        3: (12, DARK_BLUE, 8, 4),
    }
    size, color, before, after = specs[level]
    p = doc.add_paragraph()
    p.style = f"Heading {level}"
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.keep_with_next = True
    set_run_font(p.add_run(text), size=size, bold=True, color=color)
    return p


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    table.autofit = False
    set_repeat_table_header(table.rows[0])
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.width = Inches(widths[i])
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_shading(cell, LIGHT)
        set_cell_margins(cell)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        set_run_font(p.add_run(header), size=9.5, bold=True, color=DARK_BLUE)
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].width = Inches(widths[i])
            cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cells[i])
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            set_run_font(p.add_run(str(value)), size=9.3)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


doc = Document()
section = doc.sections[0]
section.top_margin = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin = Inches(1)
section.right_margin = Inches(1)
section.header_distance = Inches(0.4)
section.footer_distance = Inches(0.45)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Calibri"
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "等线")
normal.font.size = Pt(11)
normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
normal.paragraph_format.space_after = Pt(8)
normal.paragraph_format.line_spacing = 1.333

header = section.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
set_run_font(header.add_run("曲情证 · 《牡丹亭》数字人文研究智能体"), size=8.5, color=GRAY)
footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)

# Cover: editorial_cover pattern
add_para(doc, "第四届语料库与数字人文暑期学院 · C班结项成果", size=10, bold=True, color=BLUE, align=WD_ALIGN_PARAGRAPH.CENTER, after=32)
add_para(doc, "从人文问题到大模型架构", size=27, bold=True, color=DARK_BLUE, align=WD_ALIGN_PARAGRAPH.CENTER, after=10, line=1.1)
add_para(doc, "《牡丹亭还魂记》研究智能体“曲情证”项目报告", size=16, color=BLUE, align=WD_ALIGN_PARAGRAPH.CENTER, after=26)
add_para(doc, "——一个文科生如何把阅读、标注与研究判断转化为可追溯的 AI 系统", size=11, italic=True, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER, after=62)

metric = doc.add_table(rows=1, cols=4)
metric.alignment = WD_TABLE_ALIGNMENT.CENTER
metric.autofit = False
for i, (big, small) in enumerate((("80", "支人工核验曲词"), ("55", "出全文"), ("4", "层知识底座"), ("6", "类研究工具"))):
    cell = metric.cell(0, i)
    cell.width = Inches(1.625)
    set_cell_margins(cell, 120, 80, 120, 80)
    set_cell_shading(cell, LIGHT)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    set_run_font(p.add_run(big), size=19, bold=True, color=BLUE)
    p2 = cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_after = Pt(0)
    set_run_font(p2.add_run(small), size=8.5, color=GRAY)
add_para(doc, "成果形态：公开网站 + DeepSeek 智能体 + 可视化证据台 + 两分钟可编辑 HTML 汇报", size=9.5, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER, before=22, after=0)
doc.add_page_break()

add_heading(doc, "摘要", 1)
add_para(doc, "“曲情证”以“格律形式如何参与《牡丹亭》的‘至情’表达”为核心研究问题，把我已有的 Word 全文、Excel 人工标注与人物关系材料整理为可检索、可计算、可复核的知识底座，并接入 DeepSeek，形成兼具通识问答、原文检索和专题研究能力的智能体。项目的关键不在于训练一个新的基础模型，而在于用人文学术判断设计数据结构、知识分层、问题路由、工具调用、提示词和评测标准，使通用模型在特定作品上回答得更准确、更自然、更可追溯。")
add_para(doc, "本项目证明：文科生成为“大模型架构师”，并不是放弃人文学科去模仿程序员，而是把问题意识、版本意识、证据意识和阐释能力提升为系统设计能力。", bold=True, color=DARK_BLUE)

add_heading(doc, "一、从哪里开始：不是先找模型，而是先定义问题", 1)
add_para(doc, "如果直接把《牡丹亭》交给通用大模型，它能够复述常识，却难以稳定回答“哪一支曲、哪个形式指标、哪一处原文支持这个解释”。因此，我先把任务拆成两个层次：")
add_bullet(doc, "通识层：人物、情节、作者、昆曲、思想史与传播等基础问题，要自然、清楚，不能带有生硬的数据库口吻。")
add_bullet(doc, "研究层：格律、曲牌、场景和人物关系问题，要能回到人工标注、计算指标和五十五出原文。")
add_para(doc, "研究主线确定为：格律形式不是情感的静态标签，而是“至情”叙事中的组织机制。杜丽娘的情感历程和人物关系网络作为补充语境，不与主线争夺篇幅。")

add_heading(doc, "二、数据底座：把“读过”变成“可调用”", 1)
add_table(doc, ["数据层", "材料与规模", "处理方式", "承担的问答"], [
    ("权威基础知识", "19个专题条目", "综合国家级非遗、高校、剧院与学术论文，保留来源链接", "人物、情节、作者、昆曲、思想史"),
    ("剧本全文", "《牡丹亭》55出", "按出目切分，建立关键词与上下文检索", "名句出处、原文语境、情节核对"),
    ("曲词标注", "80支人工核验曲词", "保留平仄、句长、韵脚、换韵及人工解释", "格律与形式—情感研究"),
    ("关系与计算", "人物事件与场景指标", "派生仄声比、交替率、句长变异、换韵等描述性指标", "关系查询、场景比较、细读线索"),
], [1.15, 1.35, 2.55, 1.45])
add_para(doc, "数据原则：现有表格以人工标注为核心；程序只做规范化、索引和派生计算。任何曲牌、数字或关系判断都应能回到原始记录。", size=9.5, italic=True, color=GRAY)

add_heading(doc, "三、智能体架构：四层知识、三条路径、六类工具", 1)
add_para(doc, "系统采用“问题路由—检索/工具调用—大模型综合—来源返回”的流程。DeepSeek V4 Flash 负责语言理解与综合，但不能越过知识底座自行编造项目事实。")
add_table(doc, ["问题类型", "首选材料", "回答策略"], [
    ("通识问题", "权威基础知识库", "直接自然作答；来源低干扰呈现，不强行输出“数据事实/证据边界”"),
    ("原文问题", "55出全文检索", "短引原文、标明出目、补充上下文"),
    ("人物关系", "人物档案 + 关系事件", "先概述关系，再补关键事件"),
    ("专题研究", "曲词格律 + 场景比较 + 原文", "区分人工标注、计算观察与综合解释，明确方法边界"),
], [1.25, 1.9, 3.35])
add_para(doc, "六类工具包括：基础知识检索、人物档案、全文检索、格律检索、场景比较和人物关系事件。问题路由器先判断任务，再为第一轮指定最合适的工具，避免模型用一套模板回答所有问题。")

add_heading(doc, "四、性能提升来自哪里", 1)
add_number(doc, "知识增强：补入权威、可追溯的作品常识，修复“杜丽娘是谁”仍像数据查询的问题。")
add_number(doc, "提示词工程：通识问答强调自然讲解；研究问答强调证据分层与方法边界。")
add_number(doc, "工具调用与 RAG：模型先检索，再综合；原文、曲牌与指标不由模型凭记忆生成。")
add_number(doc, "问题路由：不同问题进入不同证据路径，降低无关工具和机械模板造成的答非所问。")
add_number(doc, "评测与回退：检查答案长度、问题锚点、绝对化排名和工具引用；公网模型不可用时保留本地证据模式。")
add_para(doc, "因此，项目没有虚构“微调”或“预训练”。它的可解释提升来自系统工程：知识库、RAG、Agent、提示词与评测共同约束一个成本较低的通用模型。", bold=True, color=DARK_BLUE)

add_heading(doc, "五、研究发现：形式如何参与“至情”表达", 1)
add_para(doc, "对有词汇情感向量的60支曲进行描述性观察后，主要形式指标与正、负情感总量的全局线性相关绝对值不超过0.16。这一结果不意味着形式与情感无关，而是反驳“仄声多就一定悲”“换韵多就一定激烈”的机械映射。")
add_bullet(doc, "句式伸缩：长短句的扩张与骤收，组织铺陈、停顿、迟疑与决断的时间节奏。")
add_bullet(doc, "平仄配置：仄声密度、连续段和交替率，为具体语境中的急迫、阻滞或回旋提供可比较线索。")
add_bullet(doc, "韵脚变化：换韵常与心理转向、场景切换或语势收束协同发生。")
add_para(doc, "因此，形式—情感关系必须放在“曲牌—场景—叙事位置”三层语境中解释。计算负责发现值得重读的异常或差异，人文细读负责解释其意义。")

add_heading(doc, "六、我如何从文科生变成“大模型架构师”", 1)
add_table(doc, ["原有的人文能力", "转化后的架构能力"], [
    ("提出可讨论而非可套话的问题", "定义智能体任务、边界与成功标准"),
    ("整理文本、版本与注释", "设计知识层、字段、索引与来源元数据"),
    ("区分事实、阐释与争议", "设计路由规则、系统提示词和证据等级"),
    ("细读并核对出处", "构建全文检索、曲词工具与可追溯引用"),
    ("判断论证是否成立", "建立回答评测、错误规则和回退策略"),
    ("面向听众组织表达", "把研究转化为网页、交互演示与两分钟叙事"),
], [2.9, 3.6])
add_para(doc, "这次转变的核心，是从“向模型提问的人”变成“决定模型拥有什么材料、何时调用什么工具、怎样才算回答合格的人”。代码是实现手段，人文学术判断才是架构的起点与终点。", bold=True, color=DARK_BLUE)

add_heading(doc, "七、两分钟结项汇报逻辑", 1)
add_table(doc, ["时间", "讲什么", "屏幕上展示什么"], [
    ("0—20秒", "从数据出发：我已有55出全文和80支人工核验曲词", "第1页“读过的数据”"),
    ("20—40秒", "提出问题：格律如何参与“至情”表达", "第2页研究主线"),
    ("40—70秒", "展示架构：四层知识、三条问答路径", "第3页架构流程"),
    ("70—100秒", "给出发现：弱全局相关反驳机械映射，形式要回到语境", "第4页核心发现"),
    ("100—120秒", "现场问“杜丽娘是谁”或一条格律问题，并用一句话收束", "第5页能力转变 + 智能体"),
], [0.85, 3.45, 2.2])
add_para(doc, "建议收束句：我没有让大模型替我读《牡丹亭》，而是把人文阅读变成它必须遵守的知识架构；这正是我从文科生走向大模型架构师的一步。", bold=True, color=DARK_BLUE)

add_heading(doc, "八、边界与下一步", 1)
add_bullet(doc, "当前结论属于描述性探索与计算辅助细读，不能由相关性直接推出历史因果。")
add_bullet(doc, "权威知识库是经过筛选的基础层，不等同于穷尽《牡丹亭》研究史；争议问题仍需扩充论文与版本材料。")
add_bullet(doc, "当前成本优先选用 DeepSeek API；未来可在不改前端的情况下接入千问作为备用模型，并建立成套对照评测。")
add_bullet(doc, "正式论文写作前，应进一步核对底本书目信息，并把80支曲的标注规范整理成可公开的数据说明。")

add_heading(doc, "参考资料（基础知识库主要来源）", 1)
sources = [
    "中国非物质文化遗产网：中国昆曲与代表剧目资料，https://www.ihchina.cn/project_details/13139.html",
    "UNESCO：Kun Qu Opera，https://ich.unesco.org/en/RL/kun-qu-opera-00004",
    "中华人民共和国文化和旅游部：中国国家话剧院相关资料，https://www.mct.gov.cn/whzx/zsdw/zggjhjy/201612/t20161201_776377.html",
    "上海戏剧学院：《牡丹亭》作品结构与“至情”资料，https://xxgk.sta.edu.cn/84/ee/c3330a34030/page.htm",
    "华东师范大学：《牡丹亭》“情”与“礼”研究，https://tsla.ecnu.edu.cn/CN/Y2017/V37/I5/43",
    "南开大学学报：《牡丹亭》还魂叙事与“至情”研究，https://xuebao.nankai.edu.cn/jss/CN/abstract/abstract222.shtml",
    "清华大学人文学院：《牡丹亭》故事来源与文本传统讲座资料，https://www.rwxy.tsinghua.edu.cn/info/1161/6620.htm",
    "中国戏曲学院：《牡丹亭》的创作、格律与舞台传播资料，https://www.nacta.edu.cn/xwgg/mtgx/40010.htm",
]
for source in sources:
    add_bullet(doc, source)

doc.core_properties.title = "从人文问题到大模型架构——曲情证项目报告"
doc.core_properties.subject = "《牡丹亭还魂记》数字人文与大模型应用"
doc.core_properties.keywords = "牡丹亭, 数字人文, RAG, Agent, 格律, DeepSeek"
doc.save(OUT)
print(OUT)
