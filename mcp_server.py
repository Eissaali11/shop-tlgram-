# /// script
# dependencies = [
#   "mcp",
#   "supabase",
#   "python-dotenv",
#   "httpx"
# ]
# ///

import os
import sys
import subprocess
from mcp.server.fastmcp import FastMCP
from supabase import create_client
from dotenv import load_dotenv

# تحميل الإعدادات من ملف .env في نفس مجلد السكربت
script_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(script_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_KEY", "")

# تهيئة عميل Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL else None

# إنشاء خادم MCP باسم "Telegram Support Analyzer"
mcp = FastMCP("Telegram-Support-Analyzer")

@mcp.tool()
def get_pending_messages() -> str:
    """جلب قائمة بالرسائل والمحادثات المعلقة التي لم يتم تحليلها بعد."""
    if not supabase:
        return "خطأ: لم يتم تهيئة عميل Supabase. تحقق من الإعدادات."
    try:
        res = supabase.table("support_messages").select("tg_message_id,chat_name,message,sender,sent_at").eq("status", "pending").order("sent_at", {"ascending": False}).execute()
        if not res.data:
            return "لا توجد أي رسائل معلقة حالياً."
        import json
        return json.dumps(res.data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"خطأ أثناء جلب البيانات: {str(e)}"

@mcp.tool()
def get_chat_thread(chat_name_or_id: str) -> str:
    """جلب المحادثة الكاملة التاريخية لعميل معين باستخدام اسمه أو رقم معرّفه (chat_id)."""
    if not supabase:
        return "خطأ: لم يتم تهيئة عميل Supabase."
    try:
        # التحقق إذا كان الاسم يحتوي على معرّف أو نبحث بالاسم مباشرة
        query = supabase.table("support_messages").select("tg_message_id,chat_name,message,sender,sent_at,status,sentiment,urgency,evaluation_summary,rating")
        
        if chat_name_or_id.isdigit() or (chat_name_or_id.startswith("-") and chat_name_or_id[1:].isdigit()):
            # البحث باستخدام معرف chat_id
            query = query.like("tg_message_id", f"{chat_name_or_id}:%")
        else:
            # البحث بالاسم
            query = query.eq("chat_name", chat_name_or_id)
            
        res = query.order("sent_at", {"ascending": True}).execute()
        if not res.data:
            return f"لم يتم العثور على محادثات للاسم أو المعرّف: {chat_name_or_id}"
        import json
        return json.dumps(res.data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"خطأ أثناء جلب المحادثة: {str(e)}"

@mcp.tool()
def run_telegram_collector() -> str:
    """تشغيل عملية جلب الرسائل الجديدة من تيليجرام وتخزينها في قاعدة البيانات."""
    try:
        script_path = os.path.join(script_dir, "collect_telegram.py")
        cmd = ["uv", "run", "python", script_path]
        process = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        if process.returncode == 0:
            return f"تم جلب الرسائل بنجاح!\nالمخرجات:\n{process.stdout}"
        else:
            return f"فشل جلب الرسائل مع رمز الخطأ {process.returncode}.\nالأخطاء:\n{process.stderr}"
    except Exception as e:
        return f"خطأ أثناء تشغيل السكربت: {str(e)}"

@mcp.tool()
def run_ai_analysis() -> str:
    """تشغيل عملية تحليل وتقييم كافة الرسائل المعلقة بالذكاء الاصطناعي (Gemini)."""
    try:
        script_path = os.path.join(script_dir, "analyze_telegram.py")
        cmd = ["uv", "run", "python", script_path]
        process = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        if process.returncode == 0:
            return f"تم تشغيل تحليل الذكاء الاصطناعي بنجاح!\nالمخرجات:\n{process.stdout}"
        else:
            return f"فشل تشغيل التحليل مع رمز الخطأ {process.returncode}.\nالأخطاء:\n{process.stderr}"
    except Exception as e:
        return f"خطأ أثناء تشغيل التحليل: {str(e)}"

@mcp.tool()
def evaluate_message_manually(tg_message_id: str, summary: str, category: str, urgency: str, status: str, sentiment: str, rating: int) -> str:
    """تعديل تقييم رسالة محددة يدوياً وتحديث بياناتها في Supabase."""
    if not supabase:
        return "خطأ: لم يتم تهيئة عميل Supabase."
    try:
        res = supabase.table("support_messages").update({
            "evaluation_summary": summary,
            "category": category,
            "urgency": urgency,
            "status": status,
            "sentiment": sentiment,
            "rating": rating
        }).eq("tg_message_id", tg_message_id).execute()
        
        if res.data:
            return f"تم تحديث تقييم الرسالة {tg_message_id} بنجاح!"
        else:
            return f"لم يتم العثور على رسالة بالمعرّف {tg_message_id} لتحديثها."
    except Exception as e:
        return f"خطأ أثناء حفظ التحديث: {str(e)}"

if __name__ == "__main__":
    # تشغيل الخادم عبر stdio الافتراضي لـ MCP
    mcp.run()
