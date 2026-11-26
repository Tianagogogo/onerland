{\rtf1\ansi\ansicpg936\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fnil\fcharset0 .SFNS-Regular_wdth_opsz110000_GRAD_wght2580000;}
{\colortbl;\red255\green255\blue255;\red24\green26\blue30;\red254\green230\blue228;}
{\*\expandedcolortbl;;\cssrgb\c12157\c13725\c15686;\cssrgb\c100000\c92157\c91373;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\b\fs28 \cf2 \cb3 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 import os\
import json\
import re\
import urllib.request\
import xml.etree.ElementTree as ET\
from datetime import datetime\
\
# ================= 1. \uc0\u22312 \u36825 \u37324 \u22635 \u20837 \u20320 \u35201 \u30417 \u25511 \u30340 \u33402 \u20154 /\u24037 \u20316 \u23460  RSS \u38142 \u25509  =================\
RSS_FEEDS = [\
    "https://rsshub.app/weibo/user/1195230310",        # \uc0\u26367 \u25442 \u20026 \u33402 \u20154 /\u24037 \u20316 \u23460 \u24494 \u21338  RSS\
    "https://rsshub.app/bilibili/user/dynamic/2",      # \uc0\u26367 \u25442 \u20026  B\u31449  RSS\
]\
\
# \uc0\u35302 \u21457  AI \u25552 \u21462 \u30340 \u20851 \u38190 \u35789 \u65288 \u21482 \u26377 \u21253 \u21547 \u36825 \u20123 \u35789 \u25165 \u35843 \u29992  AI\u65292 \u30465 \u38065 \u38450 \u35823 \u21028 \u65289 \
KEYWORDS = ["\uc0\u24033 \u28436 ", "\u28436 \u21809 \u20250 ", "\u24320 \u31080 ", "\u39044 \u21806 ", "\u19968 \u24320 ", "\u20108 \u24320 ", "\u19977 \u24320 ", "\u21152 \u22330 ", "\u22823 \u40614 ", "\u29483 \u30524 ", "\u32439 \u29609 \u23707 "]\
\
DATA_FILE = "tour_data.json"\
API_KEY = os.environ.get("LLM_API_KEY", "")\
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/chat/completions")\
MODEL_NAME = os.environ.get("LLM_MODEL", "deepseek-flash")\
\
\
def fetch_rss_items(url):\
    items = []\
    try:\
        req = urllib.request.Request(url, headers=\{"User-Agent": "Mozilla/5.0"\})\
        with urllib.request.urlopen(req, timeout=20) as resp:\
            xml_data = resp.read().decode("utf-8", errors="ignore")\
        root = ET.fromstring(xml_data)\
        # \uc0\u20860 \u23481  RSS 2.0 (<item>) \u21644  Atom (<entry>)\
        for node in root.findall(".//item") + root.findall(".//\{http://www.w3.org/2005/Atom\}entry"):\
            title = (node.findtext("title") or node.findtext("\{http://www.w3.org/2005/Atom\}title") or "").strip()\
            desc = (node.findtext("description") or node.findtext("\{http://www.w3.org/2005/Atom\}content") or "").strip()\
            link = (node.findtext("link") or "").strip()\
            if not link:\
                link_el = node.find("\{http://www.w3.org/2005/Atom\}link")\
                if link_el is not None:\
                    link = link_el.attrib.get("href", "")\
            clean_text = re.sub(r"<[^>]+>", " ", f"\{title\} \{desc\}")\
            clean_text = re.sub(r"\\s+", " ", clean_text).strip()\
            items.append(\{"text": clean_text[:1500], "link": link\})\
    except Exception as e:\
        print(f"\uc0\u25235 \u21462  RSS \u22833 \u36133  (\{url\}): \{e\}")\
    return items[:10]  # \uc0\u27599 \u27425 \u21482 \u26816 \u26597 \u26368 \u26032 10\u26465 \
\
\
def call_ai_extract(text):\
    if not API_KEY:\
        print("\uc0\u26410 \u37197 \u32622  LLM_API_KEY\u65292 \u36339 \u36807 \u25552 \u21462 ")\
        return None\
\
    prompt = f"""\uc0\u20320 \u26159 \u24033 \u28436 \u20449 \u24687 \u32467 \u26500 \u21270 \u25552 \u21462 \u21161 \u25163 \u12290 \u35831 \u20998 \u26512 \u20197 \u19979 \u33402 \u20154 /\u24037 \u20316 \u23460 \u21160 \u24577 \u25991 \u26412 \u65292 \u21028 \u26029 \u26159 \u21542 \u21253 \u21547 \u12304 \u28436 \u21809 \u20250 /\u24033 \u28436 \u30340 \u28436 \u20986 \u26102 \u38388 \u25110 \u24320 \u31080 \u26102 \u38388 \u65288 \u19968 \u24320 /\u20108 \u24320 /\u19977 \u24320 /\u39044 \u21806 \u65289 \u12305 \u12290 \
\uc0\u22914 \u26524 \u26080 \u20851 \u65292 \u21482 \u36820 \u22238  \{\{"is_tour": false\}\}\u12290 \
\uc0\u22914 \u26524 \u26377 \u20851 \u65292 \u20005 \u26684 \u25353 \u20197 \u19979  JSON \u26684 \u24335 \u36820 \u22238 \u65288 \u26102 \u38388 \u32479 \u19968 \u20026  YYYY-MM-DD HH:MM \u26684 \u24335 \u65292 \u26410 \u30693 \u21017 \u30041 \u31354 \u23383 \u31526 \u20018 \u65289 \u65306 \
\{\{\
  "is_tour": true,\
  "city": "\uc0\u22478 \u24066 \u21517 \u65292 \u22914 \u65306 \u19978 \u28023 \u31449 ",\
  "venue": "\uc0\u22330 \u39302 \u21517 \u31216 ",\
  "show_date": "\uc0\u28436 \u20986 \u26102 \u38388 \u65292 \u22914 \u65306 2026-12-20 19:30",\
  "round_name": "\uc0\u24320 \u31080 \u36718 \u27425 \u65292 \u22914 \u65306 \u19968 \u24320  / \u20108 \u24320  / \u19977 \u24320  / \u39044 \u21806 ",\
  "sale_time": "\uc0\u24320 \u31080 \u26102 \u38388 \u65292 \u22914 \u65306 2026-12-05 14:18",\
  "platform": "\uc0\u36141 \u31080 \u24179 \u21488 \u65292 \u22914 \u65306 \u22823 \u40614  / \u29483 \u30524  / \u32439 \u29609 \u23707 "\
\}\}\
\
\uc0\u21160 \u24577 \u20869 \u23481 \u65306 \
\{text\}"""\
\
    payload = json.dumps(\{\
        "model": MODEL_NAME,\
        "messages": [\{"role": "user", "content": prompt\}],\
        "response_format": \{"type": "json_object"\},\
        "temperature": 0.1\
    \}).encode("utf-8")\
\
    req = urllib.request.Request(\
        BASE_URL,\
        data=payload,\
        headers=\{\
            "Content-Type": "application/json",\
            "Authorization": f"Bearer \{API_KEY\}"\
        \}\
    )\
    try:\
        with urllib.request.urlopen(req, timeout=30) as resp:\
            res = json.loads(resp.read().decode("utf-8"))\
            content = res["choices"][0]["message"]["content"]\
            return json.loads(content)\
    except Exception as e:\
        print(f"AI \uc0\u25552 \u21462 \u24322 \u24120 : \{e\}")\
        return None\
\
\
def main():\
    if os.path.exists(DATA_FILE):\
        with open(DATA_FILE, "r", encoding="utf-8") as f:\
            tour_list = json.load(f)\
    else:\
        tour_list = []\
\
    processed_links = \{item.get("source_url") for item in tour_list if item.get("source_url")\}\
    updated = False\
\
    for feed in RSS_FEEDS:\
        for item in fetch_rss_items(feed):\
            if item["link"] in processed_links:\
                continue\
            if not any(kw in item["text"] for kw in KEYWORDS):\
                continue\
\
            print(f"\uc0\u21457 \u29616 \u30097 \u20284 \u24033 \u28436 \u21160 \u24577 \u65292 \u35843 \u29992  AI \u25552 \u21462 : \{item['link']\}")\
            extracted = call_ai_extract(item["text"])\
            if extracted and extracted.get("is_tour") and extracted.get("city"):\
                city = extracted["city"]\
                new_round = \{\
                    "round_name": extracted.get("round_name") or "\uc0\u24320 \u31080 ",\
                    "sale_time": extracted.get("sale_time") or "",\
                    "platform": extracted.get("platform") or "\uc0\u23448 \u26041 \u28192 \u36947 "\
                \}\
\
                # \uc0\u26597 \u25214 \u26159 \u21542 \u24050 \u26377 \u35813 \u22478 \u24066 \u35760 \u24405 \u65288 \u20363 \u22914 \u19968 \u24320 \u24050 \u23384 \u22312 \u65292 \u29616 \u22312 \u23448 \u23459 \u20108 \u24320 \u65289 \
                existing = next((x for x in tour_list if x["city"] == city), None)\
                if existing:\
                    if extracted.get("venue"):\
                        existing["venue"] = extracted["venue"]\
                    if extracted.get("show_date"):\
                        existing["show_date"] = extracted["show_date"]\
                    existing["source_url"] = item["link"]\
                    # \uc0\u36991 \u20813 \u37325 \u22797 \u28155 \u21152 \u21516 \u19968 \u36718 \u27425 \
                    if not any(r["round_name"] == new_round["round_name"] and r["sale_time"] == new_round["sale_time"] for r in existing["rounds"]):\
                        existing["rounds"].append(new_round)\
                else:\
                    tour_list.append(\{\
                        "city": city,\
                        "venue": extracted.get("venue") or "\uc0\u24453 \u20844 \u24067 ",\
                        "show_date": extracted.get("show_date") or "\uc0\u24453 \u20844 \u24067 ",\
                        "rounds": [new_round] if new_round["sale_time"] else [],\
                        "source_url": item["link"]\
                    \})\
                processed_links.add(item["link"])\
                updated = True\
\
    if updated:\
        with open(DATA_FILE, "w", encoding="utf-8") as f:\
            json.dump(tour_list, f, ensure_ascii=False, indent=2)\
        print("tour_data.json \uc0\u24050 \u26356 \u26032 \u65281 ")\
    else:\
        print("\uc0\u26412 \u27425 \u24033 \u26816 \u26080 \u26032 \u24033 \u28436 \u20449 \u24687 \u12290 ")\
\
\
if __name__ == "__main__":\
    main()\
}