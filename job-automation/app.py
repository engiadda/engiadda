from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", str(ROOT / "data" / "jobs.db")))
SOURCES_PATH = Path(os.getenv("SOURCES_PATH", str(ROOT / "config" / "sources.json")))
TZ = ZoneInfo(os.getenv("TIMEZONE", "Asia/Kolkata"))
TIMEOUT = int(os.getenv("HTTP_TIMEOUT_SECONDS", "30"))
RETRIES = int(os.getenv("MAX_RETRIES", "3"))
JOB_WORDS = re.compile(r"\b(recruitment|vacancy|vacancies|career|job|jobs|apprentice|apprenticeship|technician|engineer|trainee|notification|employment)\b", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs(
 job_id TEXT PRIMARY KEY, organization TEXT NOT NULL, recruitment_name TEXT NOT NULL,
 notification_number TEXT, post TEXT NOT NULL, vacancies TEXT, category TEXT, job_type TEXT,
 qualification TEXT, eligible_branches TEXT, experience TEXT, age_limit TEXT, age_relaxation TEXT,
 salary TEXT, pay_scale TEXT, location TEXT, application_start_date TEXT, application_last_date TEXT,
 exam_date TEXT, selection_process TEXT, application_fee TEXT, official_notification_url TEXT,
 official_apply_url TEXT, official_website_url TEXT, source_url TEXT, source_type TEXT,
 verification_status TEXT NOT NULL, priority INTEGER, first_detected TEXT, last_verified TEXT,
 last_updated TEXT, fingerprint TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_updates(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,update_type TEXT,
 previous_fingerprint TEXT,new_fingerprint TEXT,details TEXT,detected_at TEXT);
CREATE TABLE IF NOT EXISTS sources(source_id TEXT PRIMARY KEY,organization TEXT,source_type TEXT,category TEXT,url TEXT,
 priority INTEGER,enabled INTEGER,last_checked TEXT,last_success TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS publications(job_id TEXT,platform TEXT,content_type TEXT,status TEXT,published_at TEXT,
 platform_post_id TEXT,platform_url TEXT,attempt_count INTEGER DEFAULT 0,last_error TEXT,
 PRIMARY KEY(job_id,platform,content_type));
CREATE TABLE IF NOT EXISTS scan_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT,ended_at TEXT,
 sources_checked INTEGER,sources_failed INTEGER,candidates_found INTEGER,new_jobs INTEGER,updated_jobs INTEGER,
 duplicates_skipped INTEGER,unverified INTEGER,telegram_published INTEGER,website_published INTEGER,retries INTEGER,errors INTEGER);
CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id INTEGER,source_id TEXT,stage TEXT,message TEXT,created_at TEXT);
"""

FIELDS = ["organization","recruitment_name","notification_number","post","vacancies","category","job_type","qualification",
"eligible_branches","experience","age_limit","age_relaxation","salary","pay_scale","location","application_start_date",
"application_last_date","exam_date","selection_process","application_fee","official_notification_url","official_apply_url",
"official_website_url","source_url","source_type","verification_status","priority","first_detected","last_verified","last_updated","fingerprint"]


def now(): return datetime.now(TZ).isoformat(timespec="seconds")

def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH); c.row_factory = sqlite3.Row; c.executescript(SCHEMA); return c

def get(url):
    last = None
    for n in range(RETRIES):
        try:
            r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent":"EngiAddaJobBot/1.0"}); r.raise_for_status(); return r, n
        except Exception as e:
            last=e
            if n+1 < RETRIES: time.sleep(2**n)
    raise last

def source_host(url): return urlparse(url).netloc.lower().removeprefix("www.")

def is_official(source_url, target_url):
    a,b=source_host(source_url),source_host(target_url)
    return bool(a and b and (a==b or b.endswith("."+a)))

def candidate_links(source, html):
    soup=BeautifulSoup(html,"html.parser"); found=[]
    for a in soup.find_all("a",href=True):
        title=" ".join(a.stripped_strings).strip(); href=urljoin(source["url"],a["href"])
        if len(title)>=12 and JOB_WORDS.search(title): found.append((title[:300],href))
    return list(dict.fromkeys(found))

def make_id(source,title,url):
    # Stable fallback ID until a notification number/post can be extracted by a source-specific adapter.
    raw=re.sub(r"\s+"," ",f"{source['organization']}|{title}|{url}".lower()).strip()
    return hashlib.sha256(raw.encode()).hexdigest()[:24]

def fingerprint(job):
    important=["organization","recruitment_name","notification_number","post","vacancies","qualification","eligible_branches",
    "experience","age_limit","salary","location","application_start_date","application_last_date","exam_date",
    "selection_process","application_fee","official_notification_url","official_apply_url"]
    return hashlib.sha256("|".join(str(job.get(x,"")) for x in important).encode()).hexdigest()

def build_job(source,title,url):
    verified=is_official(source["url"],url)
    missing="Not mentioned in the official notification"
    job={"organization":source["organization"],"recruitment_name":title,"notification_number":missing,"post":title,
    "vacancies":missing,"category":source.get("category","government"),"job_type":"Government" if source["source_type"]=="government" else "Private",
    "qualification":missing,"eligible_branches":missing,"experience":missing,"age_limit":missing,"age_relaxation":missing,
    "salary":missing,"pay_scale":missing,"location":missing,"application_start_date":missing,"application_last_date":missing,
    "exam_date":missing,"selection_process":missing,"application_fee":missing,"official_notification_url":url if verified else "",
    "official_apply_url":"","official_website_url":source["url"],"source_url":url,"source_type":source["source_type"],
    "verification_status":"VERIFIED" if verified else "UNVERIFIED","priority":source.get("priority",3),"first_detected":now(),"last_verified":now(),"last_updated":now()}
    job["job_id"]=make_id(source,title,url); job["fingerprint"]=fingerprint(job); return job

def upsert(c,job):
    old=c.execute("SELECT * FROM jobs WHERE job_id=?",(job["job_id"],)).fetchone()
    if not old:
        cols=["job_id"]+FIELDS; vals=[job["job_id"]]+[job[x] for x in FIELDS]
        c.execute(f"INSERT INTO jobs({','.join(cols)}) VALUES({','.join('?'*len(cols))})",vals); return "NEW",None
    if old["fingerprint"]==job["fingerprint"]: return "DUPLICATE",old
    # Update the full master record; no stale fields are retained.
    cols=[x for x in FIELDS if x not in ("first_detected",)]
    c.execute(f"UPDATE jobs SET {','.join(x+'=?' for x in cols)} WHERE job_id=?",[job[x] if x not in ("last_verified","last_updated") else now() for x in cols]+[job["job_id"]])
    return "UPDATED",old

def english(j,update=False):
    if update: return f"🚨 RECRUITMENT UPDATE\n\n{j['organization']} — {j['recruitment_name']}\n\n🔴 Update: Official source information changed.\n\n📄 Official Source:\n{j['official_notification_url'] or j['source_url']}\n\nStatus: ✅ Officially Verified"
    return f"🚨 NEW JOB ALERT\n\n{j['organization']} Recruitment\n\nPost: {j['post']}\n\nVacancies: {j['vacancies']}\n\nQualification: {j['qualification']}\n\nEligible Branches: {j['eligible_branches']}\n\nAge Limit: {j['age_limit']}\n\nSalary: {j['salary']}\n\nLocation: {j['location']}\n\nApplication Start: {j['application_start_date']}\n\nLast Date: {j['application_last_date']}\n\nSelection Process: {j['selection_process']}\n\nApplication Fee: {j['application_fee']}\n\n📄 Official Notification:\n{j['official_notification_url'] or j['source_url']}\n\n📝 Apply Online:\n{j['official_apply_url'] or 'Not disclosed by the employer'}\n\n🌐 Official Website:\n{j['official_website_url']}\n\nVerification: {'✅ Verified' if j['verification_status']=='VERIFIED' else '⚠️ Unverified'}"

def hindi(j,update=False):
    if update: return f"🚨 भर्ती अपडेट\n\n{j['organization']} — {j['recruitment_name']}\n\n🔴 अपडेट: आधिकारिक स्रोत की जानकारी में बदलाव मिला।\n\n📄 आधिकारिक स्रोत:\n{j['official_notification_url'] or j['source_url']}\n\nस्थिति: ✅ आधिकारिक रूप से सत्यापित"
    return f"🚨 नई नौकरी सूचना\n\n{j['organization']} भर्ती\n\nपद: {j['post']}\n\nरिक्तियां: {j['vacancies']}\n\nयोग्यता: {j['qualification']}\n\nयोग्य शाखाएं: {j['eligible_branches']}\n\nआयु सीमा: {j['age_limit']}\n\nवेतन: {j['salary']}\n\nस्थान: {j['location']}\n\nआवेदन शुरू: {j['application_start_date']}\n\nअंतिम तिथि: {j['application_last_date']}\n\nचयन प्रक्रिया: {j['selection_process']}\n\nआवेदन शुल्क: {j['application_fee']}\n\n📄 आधिकारिक नोटिफिकेशन:\n{j['official_notification_url'] or j['source_url']}\n\n📝 ऑनलाइन आवेदन:\n{j['official_apply_url'] or 'नियोक्ता द्वारा उपलब्ध नहीं कराया गया'}\n\n🌐 आधिकारिक वेबसाइट:\n{j['official_website_url']}\n\nस्थिति: {'✅ सत्यापित' if j['verification_status']=='VERIFIED' else '⚠️ सत्यापन लंबित'}"

def telegram(c,j,update=False):
    if os.getenv("ENABLE_TELEGRAM","false").lower()!="true": return False
    token,chat=os.getenv("TELEGRAM_BOT_TOKEN"),os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat: raise RuntimeError("Telegram credentials are missing")
    typ="update" if update else "new"; row=c.execute("SELECT status FROM publications WHERE job_id=? AND platform='telegram' AND content_type=?",(j["job_id"],typ)).fetchone()
    if row and row["status"]=="PUBLISHED": return False
    resp=requests.post(f"https://api.telegram.org/bot{token}/sendMessage",json={"chat_id":chat,"text":english(j,update)+"\n\n"+hindi(j,update)},timeout=TIMEOUT); resp.raise_for_status(); data=resp.json()
    if not data.get("ok"): raise RuntimeError(str(data))
    c.execute("INSERT OR REPLACE INTO publications(job_id,platform,content_type,status,published_at,platform_post_id,attempt_count,last_error) VALUES(?,?,?,?,?,?,?,?)",(j["job_id"],"telegram",typ,"PUBLISHED",now(),str(data["result"]["message_id"]),1,None)); c.commit(); return True

def website(c,j,update=False):
    if os.getenv("ENABLE_WEBSITE","false").lower()!="true": return False
    api=os.getenv("WEBSITE_API_URL"); token=os.getenv("WEBSITE_API_TOKEN","")
    if not api: raise RuntimeError("WEBSITE_API_URL is missing")
    row=c.execute("SELECT status FROM publications WHERE job_id=? AND platform='website' AND content_type='job'",(j["job_id"],)).fetchone()
    headers={"Authorization":f"Bearer {token}"} if token else {}
    method="put" if update or row else "post"; url=api.rstrip("/")+f"/api/jobs/{j['job_id']}" if method=="put" else api.rstrip("/")+"/api/jobs"
    resp=getattr(requests,method)(url,json=dict(j),headers=headers,timeout=TIMEOUT); resp.raise_for_status()
    c.execute("INSERT OR REPLACE INTO publications(job_id,platform,content_type,status,published_at,platform_post_id,platform_url,attempt_count,last_error) VALUES(?,?,?,?,?,?,?,?,?)",(j["job_id"],"website","job","PUBLISHED",now(),resp.headers.get("Location",j["job_id"]),resp.headers.get("Location",""),1,None)); c.commit(); return True

def main():
    c=connect(); started=now(); run=c.execute("INSERT INTO scan_runs(started_at) VALUES(?)",(started,)).lastrowid
    stats={k:0 for k in ["sources_checked","sources_failed","candidates_found","new_jobs","updated_jobs","duplicates_skipped","unverified","telegram_published","website_published","retries","errors"]}
    sources=json.loads(SOURCES_PATH.read_text(encoding="utf-8"));
    for s in sources:
        if not s.get("enabled",True): continue
        stats["sources_checked"]+=1
        try:
            resp,retries=get(s["url"]); stats["retries"]+=retries
            for title,url in candidate_links(s,resp.text):
                stats["candidates_found"]+=1; job=build_job(s,title,url); state,old=upsert(c,job)
                if state=="DUPLICATE": stats["duplicates_skipped"]+=1; continue
                if job["verification_status"]!="VERIFIED": stats["unverified"]+=1; continue
                update=state=="UPDATED"; stats["updated_jobs" if update else "new_jobs"]+=1
                c.execute("INSERT INTO job_updates(job_id,update_type,previous_fingerprint,new_fingerprint,details,detected_at) VALUES(?,?,?,?,?,?)",(job["job_id"],"MEANINGFUL_UPDATE" if update else "NEW",old["fingerprint"] if old else None,job["fingerprint"],"Authoritative-source fingerprint changed" if update else "New authoritative candidate",now()))
                if telegram(c,job,update): stats["telegram_published"]+=1
                if website(c,job,update): stats["website_published"]+=1
            c.execute("UPDATE sources SET last_checked=?,last_success=?,last_error=NULL WHERE source_id=?",(now(),now(),s["source_id"]))
        except Exception as e:
            stats["sources_failed"]+=1; stats["errors"]+=1; c.execute("UPDATE sources SET last_checked=?,last_error=? WHERE source_id=?",(now(),str(e)[:1000],s["source_id"])); c.execute("INSERT INTO errors(run_id,source_id,stage,message,created_at) VALUES(?,?,?,?,?)",(run,s["source_id"],"scan",str(e)[:2000],now()))
    c.execute("UPDATE scan_runs SET ended_at=?,sources_checked=?,sources_failed=?,candidates_found=?,new_jobs=?,updated_jobs=?,duplicates_skipped=?,unverified=?,telegram_published=?,website_published=?,retries=?,errors=? WHERE id=?",(now(),*[stats[k] for k in stats],run)); c.commit(); c.close()
    print("SCAN START",started); [print(f"{k}: {v}") for k,v in stats.items()]; print("SCAN END",now())

if __name__=="__main__": main()
