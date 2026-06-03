"""
تحليل وتقييم رسائل الدعم الفني باستخدام الذكاء الاصطناعي (Gemini API) بشكل متوازٍ وسريع جداً،
ثم حفظ النتائج دفعة واحدة في Supabase.

التشغيل:
    uv run python analyze_telegram.py
"""

import os
import json
import logging
import asyncio
import httpx
from dotenv import load_dotenv
from supabase import create_client

# إعداد الـ Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("telegram_analyzer")

load_dotenv()

# ---- قراءة الإعدادات ----
try:
    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
except KeyError as e:
    logger.error(f"المتغير {e} غير موجود في ملف .env. يرجى التحقق.")
    exit(1)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def analyze_with_heuristics(message: str) -> dict:
    """تحليل احتياطي (Fallback) سريع باستخدام قواعد برمجية بسيطة."""
    message_lower = message.lower()
    
    # تحديد القسم (Category)
    category = "general"
    if any(k in message_lower for k in ["دفع", "اشتراك", "سعر", "فلوس", "فاتورة", "حساب", "شراء", "pay", "price", "billing"]):
        category = "billing"
    elif any(k in message_lower for k in ["عطل", "توقف", "مشكلة", "خطأ", "error", "bug", "crash", "كود", "code"]):
        category = "technical"
    elif any(k in message_lower for k in ["طلب", "منتج", "شحن", "توصيل", "order", "product"]):
        category = "sales"
    elif any(k in message_lower for k in ["سيء", "بطيء", "خدمة سيئة", "شكوى", "complaint"]):
        category = "complaint"

    # تحديد مدى الاستعجال (Urgency)
    urgency = "low"
    if any(k in message_lower for k in ["عاجل", "بسرعة", "طارئ", "فوراً", "urgent", "asap", "حالا"]):
        urgency = "high"
    elif any(k in message_lower for k in ["مشكلة", "تعطل", "توقف"]):
        urgency = "medium"

    # تحديد المشاعر (Sentiment)
    sentiment = "neutral"
    rating = 3
    if any(k in message_lower for k in ["شكرا", "جميل", "ممتاز", "رائع", "thanks", "great"]):
        sentiment = "positive"
        rating = 5
    elif any(k in message_lower for k in ["سيء", "مشكلة", "غاضب", "خسارة", "bad", "worst"]):
        sentiment = "negative"
        rating = 1

    summary = f"تحليل احتياطي: {message[:50]}..."

    return {
        "sentiment": sentiment,
        "category": category,
        "urgency": urgency,
        "evaluation_summary": summary,
        "rating": rating
    }


def analyze_with_gemini(message: str) -> dict:
    """تحليل متزامن لرسالة واحدة باستخدام Gemini API."""
    import asyncio
    async def _run():
        async with httpx.AsyncClient() as client:
            return await analyze_with_gemini_async(client, message)
    try:
        return asyncio.run(_run())
    except Exception as e:
        logger.error(f"خطأ أثناء التحليل المتزامن لـ Gemini: {e}")
        return analyze_with_heuristics(message)


async def analyze_with_gemini_async(client: httpx.AsyncClient, message: str) -> dict:
    """تحليل الرسالة بشكل غير متزامن باستخدام Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
أنت خبير خدمة عملاء ومحلل بيانات. قم بتحليل رسالة الدعم الفني التالية المستلمة من تطبيق Telegram واستخرج البيانات المطلوبة بصيغة JSON فقط دون أي نصوص إضافية أو علامات ```json.

الرسالة:
"{message}"

مخطط الـ JSON المطلوب بدقة:
{{
  "sentiment": "يجب أن تكون قيمة من: 'positive'، 'neutral'، 'negative'",
  "category": "يجب أن تكون قيمة من: 'billing'، 'technical'، 'sales'، 'general'، 'complaint'",
  "urgency": "قيمة من: 'high'، 'medium'، 'low'",
  "evaluation_summary": "ملخص باللغة العربية للرسالة وتقييم لاحتياج العميل بشكل مهني وواضح في سطر واحد أو سطرين",
  "rating": "رقم صحيح من 1 إلى 5 (1 = استياء تام، 5 = رضا تام)"
}}
"""

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        response = await client.post(url, json=payload, timeout=20.0)
        response.raise_for_status()
        result = response.json()
        
        text_content = result['candidates'][0]['content']['parts'][0]['text']
        data = json.loads(text_content.strip())
        
        # التحقق من وجود الحقول المطلوبة وتفادي أخطاء النوع
        return {
            "sentiment": data.get("sentiment", "neutral"),
            "category": data.get("category", "general"),
            "urgency": data.get("urgency", "low"),
            "evaluation_summary": data.get("evaluation_summary", "تم التحليل"),
            "rating": int(data.get("rating", 3))
        }
    except Exception as e:
        # عند الفشل ننتقل للتحليل الاحتياطي المحلي لتفادي تعطل السكربت
        return analyze_with_heuristics(message)


async def process_single_message(semaphore: asyncio.Semaphore, client: httpx.AsyncClient, item: dict) -> dict:
    """معالجة رسالة واحدة مع الحد من عدد الطلبات المتزامنة لتفادي حظر الـ API."""
    async with semaphore:
        tg_msg_id = item["tg_message_id"]
        text = item["message"] or ""
        
        if GEMINI_API_KEY:
            analysis = await analyze_with_gemini_async(client, text)
        else:
            analysis = analyze_with_heuristics(text)
            
        return {
            "tg_message_id": tg_msg_id,
            "sentiment": analysis["sentiment"],
            "category": analysis["category"],
            "urgency": analysis["urgency"],
            "evaluation_summary": analysis["evaluation_summary"],
            "rating": analysis["rating"],
            "status": "analyzed"
        }


async def main():
    logger.info("بدء جلب الرسائل المعلقة من قاعدة البيانات...")
    try:
        response = supabase.table("support_messages").select("tg_message_id", "message").eq("status", "pending").execute()
        messages = response.data
    except Exception as e:
        logger.error(f"خطأ أثناء الاتصال بقاعدة بيانات Supabase: {e}")
        return

    if not messages:
        logger.info("لا توجد رسائل معلقة بانتظار التحليل.")
        return

    logger.info(f"تم العثور على {len(messages)} رسالة معلقة بانتظار التحليل.")
    
    if not GEMINI_API_KEY:
        logger.warning("مفتاح GEMINI_API_KEY غير متوفر. سيتم استخدام التحليل الاحتياطي القائم على القواعد.")

    # تحديد حد التوازي بـ 10 طلبات متزامنة لتجنب ضغط الشبكة أو قيود الـ API
    semaphore = asyncio.Semaphore(10)
    
    # تشغيل الطلبات بشكل متوازٍ
    async with httpx.AsyncClient() as client:
        tasks = [process_single_message(semaphore, client, item) for item in messages]
        logger.info("جاري تحليل وتقييم الرسائل بالتوازي...")
        results = await asyncio.gather(*tasks)

    # حفظ النتائج في قاعدة البيانات دفعة واحدة (Bulk Upsert)
    if results:
        logger.info(f"جاري تحديث قاعدة البيانات لـ {len(results)} رسالة...")
        
        # نقسم التحديث إلى دفعات بحجم 200 لتسهيل معالجة قاعدة البيانات
        batch_size = 200
        success_count = 0
        for i in range(0, len(results), batch_size):
            batch = results[i:i+batch_size]
            try:
                # الـ upsert بناءً على المعرف الفريد tg_message_id
                supabase.table("support_messages").upsert(batch, on_conflict="tg_message_id").execute()
                success_count += len(batch)
                logger.info(f"تم حفظ الدفعة {i//batch_size + 1} بنجاح.")
            except Exception as e:
                logger.error(f"فشل تحديث الدفعة {i//batch_size + 1} في قاعدة البيانات: {e}")

        logger.info(f"اكتملت العملية بنجاح. تم تحديث {success_count} رسالة في Supabase.")


if __name__ == "__main__":
    asyncio.run(main())
