# 🤖 Telegram Support Analyzer & Glassmorphic AI Dashboard

An automated, serverless, and intelligence-driven customer support management system. It collects messages from Telegram, evaluates them using Gemini AI, hosts a premium glassmorphic dashboard on GitHub Pages, and schedules runs for free using GitHub Actions.

---

## 🌟 Key Features

*   **⚡ Automated Telegram Collection**: Secure Telethon-based extraction supporting 2FA logins, targeted chat tracking, and smart state caching (prevents duplicate status overrides).
*   **🧠 AI-Driven Evaluation (Gemini 2.5 Flash)**: Automated categorization (billing, technical, sales, general, complaint), sentiment analysis, urgency detection, rating (1-5 stars), and professional summaries.
*   **📊 Real-time Glassmorphic Dashboard**: A stunning responsive dark-mode dashboard built with vanilla CSS glassmorphism, Chart.js analytics, instant search/filtering, and manual evaluation override.
*   **💬 Complete Conversation Thread Browser**: View the entire history of any conversation chronologically inside a custom scrollable chat-bubble drawer UI.
*   **🔄 Supabase Realtime Sync**: Automatic instant dashboard updates when database records change.
*   **☁️ Serverless Automation (GitHub Actions)**: Pre-configured cron-scheduled workflows to sync and evaluate messages hourly for free without running a server.
*   **🔌 Model Context Protocol (MCP)**: Custom Python MCP server allowing AI clients like Claude Desktop to search, fetch, and analyze messages directly.

---

## 📂 Project Structure

```text
├── .github/workflows/telegram_sync.yml # Serverless GitHub Actions cron sync
├── collect_telegram.py                 # Telethon collector script
├── analyze_telegram.py                 # Gemini AI evaluation script
├── mcp_server.py                       # Python MCP Server for Claude Desktop
├── server.py                           # Local HTTP/1.0 API server for desktop development
├── index.html                          # Premium dashboard UI
├── style.css                           # Glassmorphic dark styling
├── app.js                              # Dashboard frontend client
├── config.js                           # Public Supabase credentials config
└── schema.sql                          # Database schema migration script
```

---

## 🚀 Local Installation & Setup

### 1. Prerequisites
Ensure you have Python 3.11+ installed. We recommend [uv](https://github.com/astral-sh/uv) for fast package management.

### 2. Database Schema
Create a project on [Supabase](https://supabase.com) and execute the SQL query inside [schema.sql](schema.sql) in your Supabase SQL Editor.

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
TG_API_ID=your_telegram_api_id
TG_API_HASH=your_telegram_api_hash
TG_PHONE=your_phone_number_with_country_code
TG_TARGET_CHATS=OptionalChatName1,OptionalChatName2

SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

GEMINI_API_KEY=your_gemini_api_key
```

Edit `config.js` with your public credentials:
```javascript
const CONFIG = {
  SUPABASE_URL: "https://your-supabase-project.supabase.co",
  SUPABASE_KEY: "your_supabase_anon_key"
};
```

### 4. Running the Local API Server
Start the local server to run and debug the dashboard:
```bash
uv run python server.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## ☁️ Cloud Deployment (GitHub Pages & Actions)

Deploy the system completely serverless and free:

### 1. GitHub Pages (Frontend)
1. Go to your GitHub repository -> **Settings** -> **Pages**.
2. Set the Source to **Deploy from a branch**.
3. Choose the `main` branch and `/ (root)` directory, then click **Save**.
4. Your live dashboard link will be displayed at the top.

### 2. GitHub Secrets (Backend Scheduler)
Go to **Settings** -> **Secrets and variables** -> **Actions** and add these secrets:

| Secret Name | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Private Supabase service role API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `TG_API_ID` | Telegram API ID |
| `TG_API_HASH` | Telegram API HASH |
| `TG_PHONE` | Telegram account phone number |
| `TG_SESSION_GZIP_BASE64` | Base64 string from `tg_session_base64.txt` (keeps you logged in) |

The GitHub Actions workflow will now automatically run every hour to collect and evaluate messages.

---

## 🔌 Connecting to Claude Desktop (MCP)

Control your support analyzer directly using Claude:

1. Open Claude Desktop's configuration file:
   `%APPDATA%/Claude/claude_desktop_config.json`
2. Add the custom server configuration:
   ```json
   {
     "mcpServers": {
       "telegram-support-analyzer": {
         "command": "uv",
         "args": [
           "run",
           "d:/tlg/extracted/mcp_server.py"
         ]
       }
     }
   }
   ```
3. Restart Claude Desktop. You can now use prompts like *"Get my pending messages"* or *"Show me the conversation history for user Moon"*.

---

## 🛡️ License
Licensed under the MIT License.
