import json
import re
from pathlib import Path
from docx import Document

ROOT = Path.cwd()
SOURCE = ROOT.parent.parent / "working_materials" / "mudanting_source" / "《牡丹亭还魂记》原文（全）.docx"
OUTPUT = ROOT / "public" / "data" / "text.json"

doc = Document(SOURCE)
heading = re.compile(r"^第.{1,4}出\S+")
chapters = []
current = {"chapter": "题辞", "paragraphs": []}

for paragraph in doc.paragraphs:
    text = re.sub(r"\s+", " ", paragraph.text).strip()
    if not text:
        continue
    if heading.match(text):
        if current["paragraphs"]:
            chapters.append(current)
        current = {"chapter": text.replace("悼殇", "闹殇").replace("硬栲", "硬拷"), "paragraphs": []}
    else:
        current["paragraphs"].append(text)
if current["paragraphs"]:
    chapters.append(current)

for chapter in chapters:
    chunks, buffer = [], ""
    for paragraph in chapter["paragraphs"]:
        if buffer and len(buffer) + len(paragraph) > 650:
            chunks.append(buffer)
            buffer = ""
        buffer += ("\n" if buffer else "") + paragraph
    if buffer:
        chunks.append(buffer)
    chapter["chunks"] = chunks
    chapter["text"] = "\n".join(chapter["paragraphs"])
    del chapter["paragraphs"]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({
    "meta": {
        "source": "用户提供 Word 原文",
        "edition": "据用户说明，底本来自国家图书馆藏《牡丹亭还魂记》；具体书目版本待核",
        "chapterCount": len([x for x in chapters if x["chapter"] != "题辞"]),
    },
    "chapters": chapters,
}, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"output": str(OUTPUT), "chapters": len(chapters)}, ensure_ascii=False))
