# 🏦 BaikalSphere Policy Engine

AI-native enterprise policy authoring, approval, and governance platform.

Built with **FastAPI** (Python) + **Next.js 15** (React 19 / TypeScript) — powered by multi-provider AI (OpenAI · Gemini · Ollama).

---

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Start the Databases](#1-start-the-databases)
  - [2. Set Up the Backend](#2-set-up-the-backend)
  - [3. Set Up the Frontend](#3-set-up-the-frontend)
- [Default Credentials](#default-credentials)
- [AI Provider Configuration](#ai-provider-configuration)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────┐       ┌──────────────────┐
│   Next.js 15    │ HTTP  │   FastAPI 0.115  │
│   Frontend      │◄─────►│   Backend        │
│   :3000         │       │   :8000          │
└─────────────────┘       └──────┬───────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼───┐  ┌────▼────┐  ┌────▼────┐
              │PostgreSQL│  │ MongoDB │  │ AI APIs │
              │  :5432   │  │  :27017 │  │ OpenAI/ │
              │ metadata │  │  docs & │  │ Gemini/ │
              │ & auth   │  │  struct │  │ Ollama  │
              └──────────┘  └─────────┘  └─────────┘
```

| Layer      | Technology                              | Purpose                                   |
|------------|-----------------------------------------|------------------------------------------ |
| Frontend   | Next.js 15, React 19, Tailwind CSS 3    | Enterprise UI, policy builder, dashboards |
| Backend    | FastAPI, SQLAlchemy 2, Motor, Pydantic 2| REST API, business logic, AI orchestration|
| Databases  | PostgreSQL 15, MongoDB 7                | Relational metadata + dynamic documents   |
| AI         | OpenAI / Gemini / Ollama (configurable) | Policy generation, chat, evaluation       |

---

## Prerequisites

Make sure the following are installed on your machine:

| Tool           | Version   | Download                                                     |
|----------------|-----------|--------------------------------------------------------------|
| **Python**     | ≥ 3.10    | [python.org](https://www.python.org/downloads/)              |
| **Node.js**    | ≥ 18 LTS  | [nodejs.org](https://nodejs.org/)                            |
| **Docker**     | Latest    | [docker.com](https://www.docker.com/products/docker-desktop/)|
| **Git**        | Latest    | [git-scm.com](https://git-scm.com/)                         |

> **Note:** Docker is required only for the databases. If you already have PostgreSQL 15 and MongoDB 7 running locally, you can skip the Docker step and update the connection strings in `.env`.

---

## Getting Started

### 1. Start the Databases

From the project root, spin up PostgreSQL and MongoDB with Docker Compose:

```bash
docker-compose up -d
```

Verify both containers are healthy:

```bash
docker ps
```

You should see `baikal_postgres` and `baikal_mongo` in a **healthy** state.

| Service    | Host        | Port    | Username     | Password          | Database       |
|------------|------------|---------|--------------|-------------------|----------------|
| PostgreSQL | localhost  | 5432    | baikal_user  | baikal_pass_2026  | policy_engine  |
| MongoDB    | localhost  | 27017   | baikal_user  | baikal_pass_2026  | policy_engine  |

---

### 2. Set Up the Backend

```bash
# Navigate to the backend directory
cd backend

# Create a Python virtual environment
python -m venv .venv

# Activate the virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (CMD):
.venv\Scripts\activate.bat
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your environment file
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux

# Edit .env and configure your database URLs and AI provider keys
# (see Environment Variables section below)

# Run database migrations
alembic upgrade head

# Start the backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at **http://localhost:8000**.  
Interactive docs at **http://localhost:8000/docs** (Swagger UI).

---

### 3. Set Up the Frontend

Open a **new terminal** window:

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**.

---

## Default Credentials

On first startup the backend seeds a default admin account:

| Field    | Value           |
|----------|-----------------|
| Email    | `admin@baikalsphere.com` |
| Password | `Admin@123`     |

> ⚠️ **Change the default password immediately in production.**

---

## AI Provider Configuration

The engine supports multiple AI providers. Configure in `backend/.env`:

| Variable          | Options                                | Description                        |
|-------------------|----------------------------------------|------------------------------------|
| `AI_PROVIDER`     | `openai` · `gemini` · `ollama` · `auto`| Which provider to use              |
| `AI_STRICT_MODE`  | `true` / `false`                       | Disable fallback cascade           |
| `AI_TEMPERATURE`  | `0.0` – `1.0`                         | Model creativity                   |

### Provider-specific keys

```env
# OpenAI
OPENAI_API_KEY=sk-...
AI_MODEL_OPENAI=gpt-4o-mini

# Google Gemini
GEMINI_API_KEY=AI...
AI_MODEL_GEMINI=gemini-1.5-pro

# Ollama (local, no API key needed)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
```

> **Tip:** Set `AI_PROVIDER=auto` to cascade through OpenAI → Gemini → Ollama, using the first available provider.

---

## Project Structure

```
POLICY_ENGIN/
├── docker-compose.yml          # PostgreSQL + MongoDB containers
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI application entry point
│   │   ├── config.py           # Pydantic settings & env loading
│   │   ├── ai/                 # AI service (chat, generation, evaluation)
│   │   ├── auth/               # JWT authentication & user management
│   │   ├── policy/             # Policy CRUD, structure builder
│   │   ├── workflow/           # Maker-checker approval workflows
│   │   ├── versioning/         # Policy version control & diff
│   │   ├── document/           # Word/PDF/JSON document composer
│   │   ├── query/              # Runtime policy query engine
│   │   ├── audit/              # Audit log & governance trails
│   │   ├── email_service/      # SMTP email notifications
│   │   ├── core/               # Security, dependencies
│   │   ├── database/           # PostgreSQL + MongoDB connections
│   │   └── middleware/         # Logging, error handling
│   ├── alembic/                # Database migrations
│   ├── tests/                  # Pytest test suite
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── login/          # Authentication pages
│   │   │   └── dashboard/      # Main application
│   │   │       ├── policies/   # Policy list, builder, chat creator
│   │   │       └── ...
│   │   ├── components/         # Reusable React components
│   │   ├── lib/                # API client, utilities
│   │   └── types/              # TypeScript type definitions
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
└── README.md
```

---

## Available Scripts

### Backend (`backend/`)

| Command                                              | Description                     |
|------------------------------------------------------|---------------------------------|
| `uvicorn app.main:app --reload --port 8000`          | Start dev server with hot reload|
| `alembic upgrade head`                               | Run database migrations         |
| `alembic revision --autogenerate -m "description"`   | Create new migration            |
| `pytest`                                             | Run test suite                  |

### Frontend (`frontend/`)

| Command          | Description                          |
|------------------|--------------------------------------|
| `npm run dev`    | Start dev server (Turbopack) on :3000|
| `npm run build`  | Production build                     |
| `npm run start`  | Serve production build               |
| `npm run lint`   | Lint with ESLint                     |

---

## Environment Variables

All backend configuration is in `backend/.env`. Copy from `backend/.env.example` and customize:

| Variable                  | Default                                         | Description                           |
|---------------------------|--------------------------------------------------|---------------------------------------|
| `APP_ENV`                 | `development`                                    | Environment name                      |
| `DEBUG`                   | `true`                                           | Enable debug mode                     |
| `SECRET_KEY`              | `change-me-in-production`                        | App secret key                        |
| `CORS_ORIGINS`            | `http://localhost:3000`                          | Allowed CORS origins                  |
| `DATABASE_URL`            | `postgresql+asyncpg://...localhost:5432/...`     | PostgreSQL connection string          |
| `MONGODB_URL`             | `mongodb://localhost:27017`                      | MongoDB connection string             |
| `MONGODB_DB_NAME`         | `policy_engine`                                  | MongoDB database name                 |
| `JWT_SECRET`              | `change-me-in-production`                        | JWT signing secret                    |
| `JWT_ALGORITHM`           | `HS256`                                          | JWT algorithm                         |
| `JWT_EXPIRATION_MINUTES`  | `60`                                             | Token expiry in minutes               |
| `ADMIN_DEFAULT_PASSWORD`  | `Admin@123`                                      | Seeded admin password                 |
| `SMTP_HOST`               | `smtp.gmail.com`                                 | Email SMTP host                       |
| `SMTP_PORT`               | `587`                                            | Email SMTP port                       |

---

## Troubleshooting

### Database connection refused
Make sure Docker containers are running: `docker-compose up -d`. Check with `docker ps` that both `baikal_postgres` and `baikal_mongo` show as **healthy**.

### `alembic upgrade head` fails
Ensure PostgreSQL is fully started before running migrations. You can wait for the healthcheck:
```bash
docker-compose up -d --wait
```

### Frontend can't reach the backend
The frontend expects the backend at `http://localhost:8000` by default. If your backend runs on a different port, set `NEXT_PUBLIC_API_URL` in the frontend environment:
```bash
# In frontend/ directory or shell
set NEXT_PUBLIC_API_URL=http://localhost:8000
```

### AI features not working
- For **Ollama**: make sure Ollama is running locally and the model is pulled (`ollama pull qwen2.5:7b-instruct-q4_K_M`)
- For **OpenAI/Gemini**: ensure the API key is set in `backend/.env`
- Check `AI_PROVIDER` is set correctly

### `bcrypt` / `passlib` errors
If you see `ValueError: password cannot be longer than 72 bytes`, ensure you have a compatible bcrypt version:
```bash
pip install bcrypt==4.0.1
```

---

## License

Internal / Proprietary — BaikalSphere © 2026




updating on the manual creation and the ai generation section add file attachment option at manual creation section and in the ai generation section add a pulse symbol where the user can attach the file or any documents you ChatGPT has the user can also upload the file by drag and drop to the chat section. now in the policy creation section there are two options one is manual policy creation and ai policy generation now when the use clicked any of the option the what should happen is that the side slide section should collapse and the screen should show two section on the left section if its manual policy generation the user gets the option to generate the policy in the mean time on the right side section should shoe the preview of the policy (live changes made by the user ) and this will be same for ai policy generation Aswell. optimize the ollama qwen 2.5 :3B to get optimized with the response and information collection for any policy the use wants to generate