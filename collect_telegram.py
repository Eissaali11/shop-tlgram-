"""
يجمع رسائل الدعم من Telegram ويحفظها في Supabase.

التشغيل:
    uv run python collect_telegram.py
"""

import os
import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import FloodWaitError
from supabase import create_client

# إعداد الـ Logging لتتبع العمليات بشكل احترافي
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("telegram_collector")

load_dotenv()

# ---- قراءة الإعدادات من البيئة (.env) ----
try:
    API_ID = int(os.environ["TG_API_ID"])
    API_HASH = os.environ["TG_API_HASH"]
    PHONE = os.environ["TG_PHONE"]
    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
except KeyError as e:
    logger.error(f"المتغير {e} غير موجود في ملف .env. يرجى التحقق من الملف.")
    exit(1)

# كلمة المرور للتحقق بخطوتين (2FA) اختيارية
TG_2FA_PASSWORD = os.environ.get("TG_2FA_PASSWORD")

# المحادثات المستهدفة (أسماء أو usernames أو معرفات عددية)
TARGET_CHATS = [
    c.strip() for c in os.environ.get("TG_TARGET_CHATS", "").split(",") if c.strip()
]
LOOKBACK_HOURS = int(os.environ.get("LOOKBACK_HOURS", "24"))

# تهيئة عميل تيليجرام وسوبابيس
client = TelegramClient("shopstore_session", API_ID, API_HASH)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def wait_for_code():
    code_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tg_code.txt")
    logger.info(f"يرجى كتابة كود التحقق في الملف: {code_file}")
    
    # انتظار كتابة الكود من قبل المستخدم في الملف
    while not os.path.exists(code_file):
        time.sleep(1)
        
    try:
        with open(code_file, "r") as f:
            code = f.read().strip()
        os.remove(code_file)
        logger.info("تم قراءة الكود بنجاح وحذف ملف الرمز المؤقت.")
        return code
    except Exception as e:
        logger.error(f"خطأ أثناء قراءة ملف الرمز: {e}")
        return ""


def wait_for_password():
    # التحقق أولاً من ملف البيئة
    if TG_2FA_PASSWORD:
        logger.info("استخدام كلمة مرور 2FA من ملف الإعدادات .env")
        return TG_2FA_PASSWORD
        
    password_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tg_password.txt")
    logger.info(f"حسابك يتطلب كلمة مرور التحقق بخطوتين (2FA). يرجى كتابتها في الملف: {password_file}")
    
    while not os.path.exists(password_file):
        time.sleep(1)
        
    try:
        with open(password_file, "r") as f:
            password = f.read().strip()
        os.remove(password_file)
        return password
    except Exception as e:
        logger.error(f"خطأ أثناء قراءة ملف كلمة المرور: {e}")
        return ""


async def fetch_messages_from_entity(entity, since, existing_ids):
    """جلب الرسائل من محادثة معينة بأمان ومعالجة أخطاء الـ Flood."""
    rows = []
    try:
        # جلب الاسم العرضي للمحادثة
        chat_name = getattr(entity, "title", None) or getattr(entity, "first_name", "محادثة غير معروفة")
        chat_id = entity.id
        username = getattr(entity, "username", None)
        
        logger.info(f"بدء جلب الرسائل من: {chat_name} (ID: {chat_id})")
        
        # لجلب كامل سياق المحادثة، نجلب آخر 100 رسالة بغض النظر عن التاريخ، ثم نلغي المكرر
        async for msg in client.iter_messages(chat_id, limit=100):
            # نستخدم msg.message لجلب النص كاملاً حتى لو كانت صورة أو فيديو مرفق بنص (Caption)
            message_text = msg.message or msg.text
            if not message_text:
                continue
            
            tg_message_id = f"{chat_id}:{msg.id}"
            
            # إذا كانت الرسالة موجودة بالفعل في قاعدة البيانات، نتخطاها لتفادي تصفير حالتها
            if tg_message_id in existing_ids:
                continue
            
            # توليد رابط الرسالة في تيليجرام
            if username:
                tg_link = f"https://t.me/{username}/{msg.id}"
            else:
                str_id = str(chat_id)
                if str_id.startswith("-100"):
                    tg_link = f"https://t.me/c/{str_id[4:]}/{msg.id}"
                elif str_id.startswith("-"):
                    tg_link = f"https://t.me/c/{str_id[1:]}/{msg.id}"
                else:
                    tg_link = f"tg://openmessage?user_id={chat_id}"
                
            rows.append({
                "tg_message_id": tg_message_id,
                "chat_name": chat_name,
                "message": message_text,
                "sender": str(msg.sender_id) if msg.sender_id else "unknown",
                "sent_at": msg.date.isoformat(),
                "status": "pending",
                "tg_link": tg_link,
            })
            
    except FloodWaitError as e:
        logger.warning(f"تم حظرك مؤقتاً. يجب الانتظار لمدة {e.seconds} ثانية.")
        await asyncio.sleep(e.seconds)
    except Exception as e:
        logger.error(f"خطأ أثناء جلب الرسائل من المحادثة: {e}")
        
    return rows


async def collect():
    logger.info("بدء تشغيل سكربت جلب رسائل تيليجرام...")
    
    # بدء العميل مع إعدادات 2FA وكود التحقق
    try:
        await client.start(
            phone=PHONE,
            code_callback=wait_for_code,
            password=wait_for_password
        )
    except Exception as e:
        logger.error(f"فشل في تسجيل الدخول إلى تيليجرام: {e}")
        return

    # جلب المعرفات الموجودة مسبقاً لتجنب التكرار وتفادي تصفير الحالات المحللة
    try:
        existing_res = supabase.table("support_messages").select("tg_message_id").execute()
        existing_ids = {r["tg_message_id"] for r in existing_res.data} if existing_res.data else set()
    except Exception as e:
        logger.error(f"خطأ أثناء جلب المعرفات الحالية من قاعدة البيانات: {e}")
        existing_ids = set()

    since = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    
    def save_rows_to_supabase(rows):
        if not rows:
            return 0
        try:
            supabase.table("support_messages").upsert(
                rows, on_conflict="tg_message_id"
            ).execute()
            logger.info(f"تم حفظ {len(rows)} رسالة بنجاح في Supabase.")
            return len(rows)
        except Exception as e:
            logger.error(f"خطأ أثناء حفظ الرسائل في Supabase: {e}")
            return 0

    success_count = 0

    # إذا تم تحديد محادثات معينة، نحاول جلبها مباشرة لتوفير الوقت والطلبات
    if TARGET_CHATS:
        logger.info(f"تم تحديد {len(TARGET_CHATS)} محادثة مستهدفة. جاري محاولة الوصول المباشر...")
        for chat in TARGET_CHATS:
            try:
                # التحقق إذا كان معرف رقمي
                if chat.isdigit() or (chat.startswith("-") and chat[1:].isdigit()):
                    chat_target = int(chat)
                else:
                    chat_target = chat
                    
                entity = await client.get_entity(chat_target)
                rows = await fetch_messages_from_entity(entity, since, existing_ids)
                if rows:
                    success_count += save_rows_to_supabase(rows)
            except Exception as e:
                logger.warning(f"فشل جلب المحادثة '{chat}' مباشرة: {e}. سيتم المحاولة عبر البحث في القائمة...")
                # سنحاول البحث عنها لاحقاً في قائمة الحوارات إذا فشل الجلب المباشر
                TARGET_CHATS.append(chat) # إعادتها للبحث العادي
    
    # إذا لم يتم تحديد محادثات أو فشل الجلب المباشر للبعض، نقوم بالبحث عبر Dialogs
    if not TARGET_CHATS or any(not c.isdigit() for c in TARGET_CHATS):
        logger.info("جاري فحص قائمة الحوارات النشطة (Dialogs) للبحث عن المحادثات المطابقة...")
        async for dialog in client.iter_dialogs(limit=50):
            username = getattr(dialog.entity, "username", None)
            
            # مطابقة المحادثة بالاسم أو الاسم التعريفي
            matches = False
            if not TARGET_CHATS:
                matches = True
            else:
                matches = (
                    dialog.name in TARGET_CHATS 
                    or (username and username in TARGET_CHATS)
                    or (username and f"@{username}" in TARGET_CHATS)
                )
                
            if matches:
                rows = await fetch_messages_from_entity(dialog.entity, since, existing_ids)
                if rows:
                    success_count += save_rows_to_supabase(rows)

    logger.info(f"اكتملت العملية. تم حفظ/تحديث ما مجموعه {success_count} رسالة جديدة.")


if __name__ == "__main__":
    asyncio.run(collect())
