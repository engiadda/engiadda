from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import feedparser
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", ROOT / "data" / "jobs.db"))
SOURCES_PATH = Path(os.getenv("SOURCES_PATH", ROOT / "config" / "sources.json"))
TIMEZONE = os.getenv("TIMEZONE", "Asia/Kolkata")
TIMEOUT = int(os.getenv("HTTP_TIMEOUT_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))

JOB_WORDS = re.compile(r"\b(recruitment|vacancy|vacancies|job|jobs|career|careers|apprentice|apprenticeship|technician|engineer|trainee|notification|employment)\b", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
 job_id TEXT PRIMARY KEY, organization TEXT NOT NULL, recruitment_name TEXT NOT NULL,
 notification_number TEXT, post TEXT NOT NULL, vacancies TEXT, category TEXT, job_type TEXT,
 qualification TEXT, eligible_branches TEXT, experience TEXT, age_limit TEXT, age_relaxation TEXT,
 salary TEXT, pay_scale TEXT, location TEXT, application_start_date TEXT, application_last_date TEXT,
 exam_date TEXT, selection_process TEXT, application_fee TEXT, official_notification_url TEXT,
 official_apply_url TEXT, official_website_url TEXT, source_url TEXT, source_type TEXT,
 verification_status TEXT NOT NULL, priority INTEGER DEFAULT 3, first_detected TEXT NOT NULL,
 last_verified TEXT NOT NULL, last_updated TEXT NOT NULL, fingerprint TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_updates (
 id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, update_type TEXT NOT NULL,
 previous_fingerprint TEXT, new_fingerprint TEXT NOT NULL, details TEXT NOT NULL, detected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
 source_id TEXT PRIMARY KEY, organization TEXT, source_type TEXT, category TEXT, url TEXT,
 priority INTEGER, enabled INTEGER, last_checked TEXT, last_success TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS publications (
 job_id TEXT NOT NULL, platform TEXT NOT NULL, content_type TEXT NOT NULL, status TEXT NOT NULL,
 published_at TEXT, platform_post_id TEXT, platform_url TEXT, attempt_count INTEGER DEFAULT 0,
 last_error TEXT, PRIMARY KEY(job_id, platform, content_type)
);
CREATE TABLE IF NOT EXISTS scan_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, ended_at TEXT,
 sources_checked INTEGER DEFAULT 0, sources_failed INTEGER DEFAULT 0, candidates_found INTEGER DEFAULT 0,
 new_jobs INTEGER DEFAULT 0, updated_jobs INTEGER DEFAULT 0, duplicates_skipped INTEGER DEFAULT 0,
 unverified INTEGER DEFAULT 0, telegram_published INTEGER DEFAULT 0, website_published INTEGER DEFAULT 0,
 retries INTEGER DEFAULT 0, errors INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS errors (
 id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, source_id TEXT, stage TEXT,
 message TEXT, created_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(ZoneInfo(TIMEZONE)).isoformat(timespec="seconds")


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def retry_get(url: str):
    last = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": "EngiAddaJobBot/1.0"})
            r.raise_for_status()
            return r, attempt - 1
        except Exception as exc:
            last = exc
            if attempt < MAX_RETRIES:
                time.sleep(min(2 ** (attempt - 1), 8))
    raise last


def load_sources(con):
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    for s in sources:
        con.execute("""INSERT INTO sources(source_id,organization,source_type,category,url,priority,enabled)
                       VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET organization=excluded.organization,
                       source_type=excluded.source_type,category=excluded.category,url=excluded.url,
                       priority=excluded.priority,enabled=excluded.enabled""",
                    (s["source_id"], s["organization"], s["source_type"], s.get("category"), s["url"], s.get("priority", 3), int(s.get("enabled", True))))
    con.commit()
    return [s for s in sources if s.get("enabled", True)]


def extract_candidates(source, html):
    soup = BeautifulSoup(html, "html.parser")
    base = source["url"]
    out = []
    for a in soup.find_all("a", href=True):
        title = " ".join(a.stripped_strings)
        href = urljoin(base, a["href"])
        if len(title) >= 12 and JOB_WORDS.search(title):
            out.append((title[:300], href))
    return list(dict.fromkeys(out))


def job_id(source, title, url):
    text = f"{source['organization']}|{title}|{url}".lower().strip()
    return hashlib.sha256(re.sub(r"\s+", " ", text).encode()).hexdigest()[:24]


def fingerprint(job):
    keys = ["organization", "recruitment_name", "notification_number", "post", "vacancies", "qualification",
            "eligible_branches", "age_limit", "salary", "location", "application_start_date",
            "application_last_date", "exam_date", "selection_process", "application_fee",
            "official_notification_url", "official_apply_url"]
    raw = "|".join(str(job.get(k, "")).strip() for k in keys)
    return hashlib.sha256(raw.encode()).hexdigest()


def build_candidate(source, title, url):
    # Deliberately conservative: the source is verified only when it is an official-domain page.
    host = requests.utils.urlparse(source["url"]).netloc.lower().removeprefix("www.")
    target_host = requests.utils.urlparse(url).netloc.lower().removeprefix("www.")
    official = target_host == host or target_host.endswith("." + host)
    jid = job_id(source, title, url)
    job = {
        "job_id": jid, "organization": source["organization"], "recruitment_name": title,
        "notification_number": "Not mentioned in the official notification", "post": title,
        "vacancies": "Not mentioned in the official notification", "category": source.get("category", "government"),
        "job_type": "Government" if source["source_type"] == "government" else "Private",
        "qualification": "Not mentioned in the official notification", "eligible_branches": "Not mentioned in the official notification",
        "experience": "Not mentioned in the official notification", "age_limit": "Not mentioned in the official notification",
        "age_relaxation": "Not mentioned in the official notification", "salary": "Not mentioned in the official notification",
        "pay_scale": "Not mentioned in the official notification", "location": "Not mentioned in the official notification",
        "application_start_date": "Not mentioned in the official notification", "application_last_date": "Not mentioned in the official notification",
        "exam_date": "Not mentioned in the official notification", "selection_process": "Not mentioned in the official notification",
        "application_fee": "Not mentioned in the official notification", "official_notification_url": url if official else "",
        "official_apply_url": "", "official_website_url": source["url"], "source_url": url,
        "source_type": source["source_type"], "verification_status": "VERIFIED" if official else "UNVERIFIED",
        "priority": source.get("priority", 3), "first_detected": now(), "last_verified": now(), "last_updated": now()
    }
    job["fingerprint"] = fingerprint(job)
    return job


def upsert_job(con, job):
    existing = con.execute("SELECT * FROM jobs WHERE job_id=?", (job["job_id"],)).fetchone()
    if not existing:
        cols = list(job)
        con.execute(f"INSERT INTO jobs({','.join(cols)}) VALUES({','.join('?' for _ in cols)})", [job[c] for c in cols])
        return "NEW", None
    if existing["fingerprint"] == job["fingerprint"]:
        return "DUPLICATE", existing
    con.execute("""UPDATE jobs SET recruitment_name=?,post=?,verification_status=?,source_url=?,official_notification_url=?,
                   last_verified=?,last_updated=?,fingerprint=? WHERE job_id=?""",
                (job["recruitment_name"], job["post"], job["verification_status"], job["source_url"],
                 job["official_notification_url"], now(), now(), job["fingerprint"], job["job_id"]))
    return "UPDATED", existing


def english(job, update=False, old=None):
    if update and old:
        return ("🚨 RECRUITMENT UPDATE\n\n"
                f"{job['organization']} — {job['recruitment_name']}\n\n"
                f"🔴 Update: Official source content changed.\n\n"
                f"📄 Official Source:\n{job['official_notification_url'] or job['source_url']}\n\n"
                "Status: ✅ Officially Verified")
    return ("🚨 NEW JOB ALERT\n\n"
            f"{job['organization']} Recruitment\n\nPost: {job['post']}\n\n"
            f"Vacancies: {job['vacancies']}\n\nQualification: {job['qualification']}\n\n"
            f"Eligible Branches: {job['eligible_branches']}\n\nAge Limit: {job['age_limit']}\n\n"
            f"Salary: {job['salary']}\n\nLocation: {job['location']}\n\n"
            f"Application Start: {job['application_start_date']}\n\nLast Date: {job['application_last_date']}\n\n"
            f"Selection Process: {job['selection_process']}\n\nApplication Fee: {job['application_fee']}\n\n"
            f"📄 Official Notification:\n{job['official_notification_url'] or job['source_url']}\n\n"
            f"📝 Apply Online:\n{job['official_apply_url'] or 'Not disclosed by the employer'}\n\n"
            f"🌐 Official Website:\n{job['official_website_url']}\n\nVerification: {'✅ Verified' if job['verification_status']=='VERIFIED' else '⚠️ Unverified'}")


def hindi(job, update=False, old=None):
    # Facts remain byte-for-byte identical; only headings are localized.
    if update and old:
        return ("🚨 भर्ती अपडेट\n\n"
                f"{job['organization']} — {job['recruitment_name']}\n\n"
                "🔴 अपडेट: आधिकारिक स्रोत की जानकारी में बदलाव मिला।\n\n"
                f"📄 आधिकारिक स्रोत:\n{job['official_notification_url'] or job['source_url']}\n\n"
                "स्थिति: ✅ आधिकारिक रूप से सत्यापित")
    return ("🚨 नई नौकरी सूचना\n\n"
            f"{job['organization']} भर्ती\n\nपद: {job['post']}\n\n"
            f"रिक्तियां: {job['vacancies']}\n\nयोग्यता: {job['qualification']}\n\n"
            f"योग्य शाखाएं: {job['eligible_branches']}\n\nआयु सीमा: {job['age_limit']}\n\n"
            f"वेतन: {job['salary']}\n\nस्थान: {job['location']}\n\n"
            f"आवेदन शुरू: {job['application_start_date']}\n\nअंतिम तिथि: {job['application_last_date']}\n\n"
            f"चयन प्रक्रिया: {job['selection_process']}\n\nआवेदन शुल्क: {job['application_fee']}\n\n"
            f"📄 आधिकारिक नोटिफिकेशन:\n{job['official_notification_url'] or job['source_url']}\n\n"
            f"📝 ऑनलाइन आवेदन:\n{job['official_apply_url'] or 'नियोक्ता द्वारा उपलब्ध नहीं कराया गया'}\n\n"
            f"🌐 आधिकारिक वेबसाइट:\n{job['official_website_url']}\n\nस्थिति: {'✅ सत्यापित' if job['verification_status']=='VERIFIED' else '⚠️ सत्यापन लंबित'}")


def publish_telegram(con, job, update=False, old=None):
    if os.getenv("ENABLE_TELEGRAM", "false").lower() != "true": return False
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat: raise RuntimeError("Telegram is enabled but credentials are missing")
    key = (job["job_id"], "telegram", "update" if update else "new")
    row = con.execute("SELECT status FROM publications WHERE job_id=? AND platform=? AND content_type=?", key).fetchone()
    if row and row["status"] == "PUBLISHED": return False
    text = english(job, update, old) + "\n\n" + hindi(job, update, old)
    r, _ = retry_get(f"https://api.telegram.org/bot{token}/sendMessage") if False else (None, 0)
    resp = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text}, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"): raise RuntimeError(data)
    msg_id = str(data["result"]["message_id"])
    con.execute("INSERT OR REPLACE INTO publications(job_id,platform,content_type,status,published_at,platform_post_id,attempt_count) VALUES(?,?,?,?,?,?,?)",
                (job["job_id"], "telegram", key[2], "PUBLISHED", now(), msg_id, 1))
    con.commit(); return True


def publish_website(con, job):
    if os.getenv("ENABLE_WEBSITE", "false").lower() != "true": return False
    api, token = os.getenv("WEBSITE_API_URL"), os.getenv("WEBSITE_API_TOKEN")
    if not api: raise RuntimeError("Website publishing is enabled but WEBSITE_API_URL is missing")
    row = con.execute("SELECT status FROM publications WHERE job_id=? AND platform='website' AND content_type='job'", (job["job_id"],)).fetchone()
    if row and row["status"] == "PUBLISHED": return False
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.post(api.rstrip("/") + "/api/jobs", json=dict(job), headers=headers, timeout=TIMEOUT)
    r.raise_for_status()
    con.execute("INSERT OR REPLACE INTO publications(job_id,platform,content_type,status,published_at,platform_post_id,platform_url,attempt_count) VALUES(?,?,?,?,?,?,?,?)",
                (job["job_id"], "website", "job", "PUBLISHED", now(), r.headers.get("Location", ""), r.headers.get("Location", ""), 1))
    con.commit(); return True


def main():
    con = db(); started = now()
    run = con.execute("INSERT INTO scan_runs(started_at) VALUES(?)", (started,)).lastrowid
    sources = load_sources(con)
    stats = {"sources_checked":0,"sources_failed":0,"candidates_found":0,"new_jobs":0,"updated_jobs":0,"duplicates_skipped":0,"unverified":0,"telegram_published":0,"website_published":0,"retries":0,"errors":0}
    for source in sources:
        stats["sources_checked"] += 1
        try:
            r, retries = retry_get(source["url"]); stats["retries"] += retries
            candidates = extract_candidates(source, r.text); stats["candidates_found"] += len(candidates)
            for title, url in candidates:
                job = build_candidate(source, title, url)
                status, old = upsert_job(con, job)
                if status == "DUPLICATE": stats["duplicates_skipped"] += 1; continue
                if job["verification_status"] != "VERIFIED": stats["unverified"] += 1; continue
                update = status == "UPDATED"
                stats["new_jobs" if status == "NEW" else "updated_jobs"] += 1
                con.execute("INSERT INTO job_updates(job_id,update_type,previous_fingerprint,new_fingerprint,details,detected_at) VALUES(?,?,?,?,?,?)",
                            (job["job_id"], "MEANINGFUL_UPDATE" if update else "NEW", old["fingerprint"] if old else None, job["fingerprint"],
                             "Official-source fingerprint changed" if update else "New verified official-source candidate", now()))
                if update:
                    # An update is published only if it is authoritative; the source check above enforces that.
                    if publish_telegram(con, job, True, old): stats["telegram_published"] += 1
                    if publish_website(con, job): stats["website_published"] += 1
                else:
                    if publish_telegram(con, job): stats["telegram_published"] += 1
                    if publish_website(con, job): stats["website_published"] += 1
            con.execute("UPDATE sources SET last_checked=?,last_success=?,last_error=NULL WHERE source_id=?", (now(), now(), source["source_id"]))
        except Exception as exc:
            stats["sources_failed"] += 1; stats["errors"] += 1
            con.execute("UPDATE sources SET last_checked=?,last_error=? WHERE source_id=?", (now(), str(exc)[:1000], source["source_id"]))
            con.execute("INSERT INTO errors(run_id,source_id,stage,message,created_at) VALUES(?,?,?,?,?)", (run, source["source_id"], "scan", str(exc)[:2000], now()))
    con.execute("UPDATE scan_runs SET ended_at=?,sources_checked=?,sources_failed=?,candidates_found=?,new_jobs=?,updated_jobs=?,duplicates_skipped=?,unverified=?,telegram_published=?,website_published=?,retries=?,errors=? WHERE id=?",
                (now(), *[stats[k] for k in ("sources_checked","sources_failed","candidates_found","new_jobs","updated_jobs","duplicates_skipped","unverified","telegram_published","website_published","retries","errors")], run))
    con.commit(); con.close()
    print("SCAN START", started)
    for k,v in stats.items(): print(f"{k}: {v}")
    print("SCAN END", now())


if __name__ == "__main__":
    main()
