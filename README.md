# 🏠 RoomieDo

A gamified household chores tracker for roommates — built with React Native (Expo), Supabase, and Node.js on Render.

## Project Structure

```
roomie-do/
├── mobile/          # Expo React Native Android app
├── backend/         # Node.js + Express API (deploy to Render)
└── supabase_schema.sql  # Run this in Supabase SQL Editor first
```

---

## 🚀 Setup Guide

### Step 1 — Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run `supabase_schema.sql`
3. Go to **Storage** → create two buckets:
   - `avatars` (private)
   - `task-photos` (private)
4. Go to **Authentication → Providers** — Email is enabled by default (phone numbers are stored as `<number>@roomie.do`)
5. Copy your **Project URL** and **anon key** from Settings → API

### Step 2 — Backend (Render)

1. Push the `backend/` folder to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service → connect repo
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   PORT=3000
   ```

### Step 3 — Mobile App

```bash
cd mobile

# Copy env file and fill in your values
cp .env.example .env

# Install dependencies (already done if you followed setup)
npm install

# Add Node path to your PowerShell session first:
$env:PATH = "C:\Users\cmlav\Downloads\node-v26.13.0-win-x64\node-v26.13.0-win-x64;$env:PATH"

# Start Expo development server
npx expo start --android
```

### Step 4 — Add Node to PATH permanently

To avoid setting `$env:PATH` every time, add Node to your system PATH:
1. Search "Environment Variables" in Windows
2. Edit **Path** under System Variables
3. Add: `C:\Users\cmlav\Downloads\node-v26.13.0-win-x64\node-v26.13.0-win-x64`

---

## 📱 Features

| Screen | Description |
|---|---|
| **Home** | XP bar, streak, quick log button, top 3 leaderboard |
| **Tasks** | Browse and log chores by category |
| **Leaderboard** | Weekly / Monthly / All-time rankings with credits progress bar |
| **Feed** | Live realtime activity feed with emoji reactions |
| **Profile** | Stats, badges, fairness score |
| **Admin** | Manage tasks, set credits, invite codes, remove members |

---

## 🔐 Auth

Phone number is used as the identifier (stored internally as `<phone>@roomie.do`). No SMS OTP required — users log in with phone + password.

---

## 🔑 Environment Variables

### `mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=https://your-app.onrender.com
```

### `backend/.env`
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3000
```

---

## 🛠️ Tech Stack

- **Mobile**: React Native + Expo SDK 57 (Android)
- **Auth + DB + Storage + Realtime**: Supabase
- **Backend API**: Node.js + Express (TypeScript)
- **Hosting**: Render
- **State**: Zustand
- **Navigation**: Expo Router

