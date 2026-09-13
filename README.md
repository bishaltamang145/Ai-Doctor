# Live Search 🔍⚡ (Standalone)

Real-time health and live-search voice assistants powered by LiveKit, Gemini native audio, and trusted reference APIs.

---

## 📁 Folder Structure

```
livesearch/
├── backend/               # Python LiveKit LiveSearch Agent service
│   ├── doctor.py          # Health agent: medicine, conditions, symptoms, BMI, news, notepad & anatomy
│   ├── requirements.txt   # Python dependencies
│   ├── pyproject.toml     # uv configuration
│   └── .env.local         # LiveKit, Google & Tavily credentials
└── frontend/              # Next.js 15 Web Application
    ├── app/               # App Router & LiveKit token API
    ├── components/        # Audio visualizer, news panel, notepad, controls
    ├── package.json       # Frontend dependencies
    └── .env.local         # LiveKit client credentials (AGENT_NAME=livesearch-agent)
```

---

## 🚀 How to Run

### 1. Start the Health Backend

Open a terminal in the `backend` directory:

```bash
cd livesearch/backend

# Using uv:
uv run python doctor.py dev

# Or using standard venv / pip:
# python -m venv .venv
# .venv\Scripts\activate
# pip install -r requirements.txt
# python doctor.py dev
```

### 2. Start the LiveSearch Frontend

In a separate terminal:

```bash
cd livesearch/frontend
npm install   # (or pnpm install)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The backend dependencies are all listed in `backend/requirements.txt`, including the LiveKit,
Gemini, Bey avatar, health-search, document, and vector-search packages. Install them with:

```bash
backend\myenv1\Scripts\pip install -r backend\requirements.txt
```

For the Beyond Presence video avatar, set `ENABLE_BEY_AVATAR=true`, `BEY_API_KEY`, and
`HEALTH_BEY_AVATAR_ID` (or your existing `BEY_AVATAR_ID`) in `backend/.env.local`. The browser
dispatches `health-agent`; the backend also keeps `doctor-agent` registered for existing deployments.
