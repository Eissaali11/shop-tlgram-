import os
import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, HTTPServer
import socketserver
from dotenv import load_dotenv
from supabase import create_client

# تحميل المتغيرات من ملف .env
load_dotenv()

PORT = 8000

# قراءة الإعدادات من البيئة (.env)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_KEY", "")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL else None

class DashboardHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def end_headers(self):
        # تفعيل CORS للوصول المحلي السلس وتفادي الكاش أثناء التطوير
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/collect":
            self.run_script("collect_telegram.py", "جاري جلب المحادثات من تيليجرام...")
        elif self.path == "/api/analyze":
            self.run_script("analyze_telegram.py", "جاري تحليل المحادثات بواسطة الذكاء الاصطناعي...")
        elif self.path == "/api/analyze-single":
            self.handle_analyze_single()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

    def handle_analyze_single(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data.decode('utf-8'))
            tg_message_id = params.get("tg_message_id")
            
            if not tg_message_id:
                self.send_error_response("المعرف tg_message_id مطلوب")
                return

            # استيراد دوال التحليل ديناميكياً من السكربت الموجود
            import analyze_telegram
            
            # جلب الرسالة من قاعدة البيانات
            res = supabase.table("support_messages").select("message").eq("tg_message_id", tg_message_id).execute()
            
            if not res.data:
                self.send_error_response("الرسالة غير موجودة في قاعدة البيانات")
                return
                
            msg_text = res.data[0]["message"] or ""
            gemini_key = os.environ.get("GEMINI_API_KEY")
            
            # تشغيل التحليل
            if gemini_key:
                analysis = analyze_telegram.analyze_with_gemini(msg_text)
            else:
                analysis = analyze_telegram.analyze_with_heuristics(msg_text)
                
            # تحديث الصف في قاعدة البيانات
            supabase.table("support_messages").update({
                "sentiment": analysis["sentiment"],
                "category": analysis["category"],
                "urgency": analysis["urgency"],
                "evaluation_summary": analysis["evaluation_summary"],
                "rating": int(analysis["rating"]),
                "status": "analyzed"
            }).eq("tg_message_id", tg_message_id).execute()
            
            self.send_success_response({"analysis": analysis})
            
        except Exception as e:
            self.send_error_response(f"خطأ داخلي: {str(e)}")

    def send_success_response(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps({"success": True, **data}, ensure_ascii=False).encode("utf-8"))

    def send_error_response(self, error_message):
        self.send_response(400)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps({"success": False, "message": error_message}, ensure_ascii=False).encode("utf-8"))

    def run_script(self, script_name, start_message):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), script_name)
        
        # تشغيل السكربت وجلب المخرجات
        try:
            cmd = ["uv", "run", "python", script_path]
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore"
            )
            success = process.returncode == 0
            response_data = {
                "success": success,
                "message": f"اكتمل تشغيل السكربت {script_name}",
                "stdout": process.stdout,
                "stderr": process.stderr,
                "exit_code": process.returncode
            }
        except Exception as e:
            response_data = {
                "success": False,
                "message": f"فشل تشغيل السكربت: {str(e)}",
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1
            }

        self.wfile.write(json.dumps(response_data, ensure_ascii=False).encode("utf-8"))

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    
    with HTTPServer(("", PORT), DashboardHandler) as httpd:
        print(f"============================================================")
        print(f"   لوحة تحكم تيليجرام تعمل الآن على الرابط:")
        print(f"   http://localhost:{PORT}")
        print(f"============================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nإيقاف السيرفر...")

if __name__ == "__main__":
    main()
