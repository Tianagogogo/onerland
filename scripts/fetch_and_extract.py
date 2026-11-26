import os
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

# ================= 1. 在这里填入你要监控的艺人/工作室 RSS 链接 =================
RSS_FEEDS = [
    "https://rsshub.app/weibo/user/1195230310",        # 替换为艺人/工作室微博 RSS
    "https://rsshub.app/bilibili/user/dynamic/2",      # 替换为 B站 RSS
]

# 触发 AI 提取的关键词（只有包含这些词才调用 AI，省钱防误判）
KEYWORDS = ["巡演", "演唱会", "开票", "预售", "一开", "二开", "三开", "加场", "大麦", "猫眼", "纷玩岛"]

DATA_FILE = "tour_data.json"
API_KEY = os.environ.get("LLM_API_KEY", "")
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/chat/completions")
MODEL_NAME = os.environ.get("LLM_MODEL", "deepseek-flash")


def fetch_rss_items(url):
    items = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            xml_data = resp.read().decode("utf-8", errors="ignore")
        root = ET.fromstring(xml_data)
        # 兼容 RSS 2.0 (<item>) 和 Atom (<entry>)
        for node in root.findall(".//item") + root.findall(".//{http://www.w3.org/2005/Atom}entry"):
            title = (node.findtext("title") or node.findtext("{http://www.w3.org/2005/Atom}title") or "").strip()
            desc = (node.findtext("description") or node.findtext("{http://www.w3.org/2005/Atom}content") or "").strip()
            link = (node.findtext("link") or "").strip()
            if not link:
                link_el = node.find("{http://www.w3.org/2005/Atom}link")
                if link_el is not None:
                    link = link_el.attrib.get("href", "")
            clean_text = re.sub(r"<[^>]+>", " ", f"{title} {desc}")
            clean_text = re.sub(r"\s+", " ", clean_text).strip()
            items.append({"text": clean_text[:1500], "link": link})
    except Exception as e:
        print(f"抓取 RSS 失败 ({url}): {e}")
    return items[:10]  # 每次只检查最新10条


def call_ai_extract(text):
    if not API_KEY:
        print("未配置 LLM_API_KEY，跳过提取")
        return None

    prompt = f"""你是巡演信息结构化提取助手。请分析以下艺人/工作室动态文本，判断是否包含【演唱会/巡演的演出时间或开票时间（一开/二开/三开/预售）】。
如果无关，只返回 {{"is_tour": false}}。
如果有关，严格按以下 JSON 格式返回（时间统一为 YYYY-MM-DD HH:MM 格式，未知则留空字符串）：
{{
  "is_tour": true,
  "city": "城市名，如：上海站",
  "venue": "场馆名称",
  "show_date": "演出时间，如：2026-12-20 19:30",
  "round_name": "开票轮次，如：一开 / 二开 / 三开 / 预售",
  "sale_time": "开票时间，如：2026-12-05 14:18",
  "platform": "购票平台，如：大麦 / 猫眼 / 纷玩岛"
}}

动态内容：
{text}"""

    payload = json.dumps({
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }).encode("utf-8")

    req = urllib.request.Request(
        BASE_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            content = res["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception as e:
        print(f"AI 提取异常: {e}")
        return None


def main():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            tour_list = json.load(f)
    else:
        tour_list = []

    processed_links = {item.get("source_url") for item in tour_list if item.get("source_url")}
    updated = False

    for feed in RSS_FEEDS:
        for item in fetch_rss_items(feed):
            if item["link"] in processed_links:
                continue
            if not any(kw in item["text"] for kw in KEYWORDS):
                continue

            print(f"发现疑似巡演动态，调用 AI 提取: {item['link']}")
            extracted = call_ai_extract(item["text"])
            if extracted and extracted.get("is_tour") and extracted.get("city"):
                city = extracted["city"]
                new_round = {
                    "round_name": extracted.get("round_name") or "开票",
                    "sale_time": extracted.get("sale_time") or "",
                    "platform": extracted.get("platform") or "官方渠道"
                }

                # 查找是否已有该城市记录（例如一开已存在，现在官宣二开）
                existing = next((x for x in tour_list if x["city"] == city), None)
                if existing:
                    if extracted.get("venue"):
                        existing["venue"] = extracted["venue"]
                    if extracted.get("show_date"):
                        existing["show_date"] = extracted["show_date"]
                    existing["source_url"] = item["link"]
                    # 避免重复添加同一轮次
                    if not any(r["round_name"] == new_round["round_name"] and r["sale_time"] == new_round["sale_time"] for r in existing["rounds"]):
                        existing["rounds"].append(new_round)
                else:
                    tour_list.append({
                        "city": city,
                        "venue": extracted.get("venue") or "待公布",
                        "show_date": extracted.get("show_date") or "待公布",
                        "rounds": [new_round] if new_round["sale_time"] else [],
                        "source_url": item["link"]
                    })
                processed_links.add(item["link"])
                updated = True

    if updated:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(tour_list, f, ensure_ascii=False, indent=2)
        print("tour_data.json 已更新！")
    else:
        print("本次巡检无新巡演信息。")


if __name__ == "__main__":
    main()
