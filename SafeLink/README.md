# SafeLink — Emergency Contact & Live Location Sharing System

SafeLink is a full-stack, production-grade mobile emergency safeguard and dispatch system built with **Expo React Native, TypeScript, FastAPI, and MongoDB**.

---

## 1. Features

* **Instant SOS Emergency System**:
  * 5-second countdown with accidental cancel safeguards and immediate flash dispatch.
  * Real-time GPS coordinate acquisition and reverse-geocoded street address.
  * Google Maps live location link generation.
  * Direct SMS integration via native device SMS composer prefilled with coordinates.
  * Direct WhatsApp alert integration.
  * In-app emergency cancellation and resolution without requiring physical interaction with emergency contacts.
* **Emergency Contact Management**:
  * Manual contact creation and editing with relationship roles.
  * One-tap contact import directly from device contacts (`expo-contacts`).
  * Dedicated default primary contact selection.
  * Full ownership enforcement stored securely in MongoDB.
* **Live Location & Interactive Map**:
  * Real GPS coordinates, altitude, heading, speed, and accuracy radius.
  * Interactive map with real-time location markers, pulse radar, and pan/zoom controls.
  * Live tracking toggle with periodic background telemetry sync.
  * Shareable Google Maps URL generator.
* **Authentication & Role-Based Access Control**:
  * Secure user registration and login with **Argon2** password hashing.
  * Standardized **JWT access tokens** with cryptographic signature validation.
  * Dual-layer storage using **Expo SecureStore** with AsyncStorage fallback.
  * Automatic token attachment via centralized Axios API service.
  * Roles: `USER` and `ADMIN`.
* **Administrator Command Center**:
  * Total registered users, total incidents, and status breakdown.
  * Real-time active emergency alert monitoring.
  * Incident telemetry inspection with embedded map previews.
  * User account status auditing.
* **Pre-Configured Demo Accounts**:
  * **User Demo (Mohith)**: Role `USER`, pre-seeded with emergency guardian.
  * **Admin Demo (Mohith)**: Role `ADMIN`, privileged access to command center.

---

## 2. Technology Stack

### Frontend:
* **Framework**: Expo SDK 52 / React Native 0.76 (TypeScript)
* **Routing**: Expo Router v4 (File-based navigation)
* **HTTP Client**: Axios with automatic Bearer token interceptor
* **Storage**: Expo SecureStore + AsyncStorage
* **Sensors & System**: Expo Location, Expo Contacts, Expo Linking
* **Map**: SafeLinkMapView (Leaflet / Mapbox interactive map via WebView)

### Backend:
* **Framework**: FastAPI (Python 3.10+)
* **Server**: Uvicorn ASGI
* **Database**: MongoDB (Local or MongoDB Atlas via Motor / PyMongo)
* **Security & Auth**: PyJWT, Argon2-cffi, Pydantic v2
* **Configuration**: Python-dotenv / Pydantic BaseSettings

---

## 3. Project Structure

```
SafeLink/
│
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx           # Navigation container & AuthProvider
│   │   ├── index.tsx             # Root splash & session redirect
│   │   ├── login.tsx             # Sign in & 1-tap demo access
│   │   ├── signup.tsx            # User registration
│   │   ├── dashboard.tsx         # User safety dashboard & prominent SOS
│   │   ├── contacts.tsx          # Contact management & phone import
│   │   ├── live-location.tsx     # GPS telemetry & interactive map
│   │   ├── sos.tsx               # Emergency countdown, active dispatch & SMS/WhatsApp
│   │   ├── history.tsx           # Incident log with status filters
│   │   ├── settings.tsx          # Profile editor & account switcher
│   │   └── admin/
│   │       ├── dashboard.tsx     # Admin command center & aggregate stats
│   │       ├── users.tsx         # Registered user roster
│   │       └── incidents.tsx     # Incident audit with map previews
│   │
│   ├── components/               # Reusable UI (Button, Card, Input, MapView, Badge)
│   ├── services/                 # Centralized Axios API, Location, Contacts, SOS
│   ├── hooks/                    # Auth context & session hooks
│   ├── constants/                # Colors, AppConfig, layout constants
│   ├── assets/                   # App icons and splash assets
│   ├── .env.example              # Frontend environment template
│   ├── app.json                  # Expo application configuration
│   └── package.json              # NPM dependencies
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI application entry point
│   │   ├── config.py             # Pydantic environment settings
│   │   ├── database.py           # MongoDB connection & resilient storage wrapper
│   │   ├── dependencies.py       # JWT verification & role authorization
│   │   ├── models/               # Database document structures
│   │   ├── schemas/              # Pydantic request & response schemas
│   │   ├── routes/
│   │   │   ├── auth.py           # /auth endpoints (register, login, demo-login)
│   │   │   ├── users.py          # /users/me endpoints
│   │   │   ├── contacts.py       # /contacts endpoints
│   │   │   ├── location.py       # /location endpoints
│   │   │   ├── sos.py            # /sos endpoints
│   │   │   └── admin.py          # /admin endpoints
│   │   └── services/
│   │       ├── auth_service.py   # Argon2 hashing & JWT encoding/decoding
│   │       └── init_db.py        # Demo account provisioning script
│   ├── .env.example              # Backend environment template
│   └── requirements.txt          # Python dependencies
│
└── README.md
```

---

## 4. Setup & Running Instructions

### Step 1: Backend Setup & Startup

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd SafeLink/backend
   ```
2. Install Python dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. Configure environment variables (a default `.env` is already created from `.env.example`):
   ```ini
   MONGODB_URI=mongodb://localhost:27017
   DATABASE_NAME=safelink
   SECRET_KEY=safelink_super_secure_jwt_secret_key_2026_production_grade
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=10080
   HOST=0.0.0.0
   PORT=8000
   CORS_ORIGINS=*
   ```
4. Start the FastAPI server:
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
5. Interactive Swagger API documentation will be available at:
   ```
   http://127.0.0.1:8000/docs
   ```

---

### Step 2: Frontend Setup & Startup

1. Open a second terminal and navigate to the frontend directory:
   ```bash
   cd SafeLink/frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Configure frontend environment variables in `frontend/.env`:
   ```ini
   EXPO_PUBLIC_API_URL=http://localhost:8000
   EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
   ```
   * **For Web on same PC**: `http://localhost:8000`
   * **For Android Emulator**: `http://10.0.2.2:8000`
   * **For Physical Mobile Phone**: `http://<YOUR_COMPUTER_LAN_IP>:8000` (e.g. `http://192.168.1.5:8000`)
4. Start the Expo development server:
   ```bash
   npx expo start
   ```
5. Scan the QR code using Expo Go on Android / iOS, or press **`w`** in the terminal to open the web version in your browser.

---

## 5. Demo Accounts

Both accounts are automatically provisioned in MongoDB when the backend starts:

| Account | Display Name | Role | Email | Password |
| :--- | :--- | :--- | :--- | :--- |
| **User Demo** | Mohith | `USER` | `mohith@safelink.org` | `SafeLink123!` |
| **Admin Demo** | Mohith | `ADMIN` | `admin@safelink.org` | `AdminSafeLink123!` |

*You can log in manually using the credentials above, or tap the **User Demo (Mohith)** or **Admin Demo** buttons on the login screen for instant one-tap access.*

---

## 6. API Reference Summary

* **Authentication**:
  * `POST /auth/register` — Create new user profile.
  * `POST /auth/login` — Sign in with email & password.
  * `POST /auth/demo-login` — Sign in as User Demo or Admin Demo.
  * `GET /auth/me` — Verify token and get current user.
* **User Profile**:
  * `GET /users/me` — Read profile details.
  * `PUT /users/me` — Update emergency medical information.
* **Contacts**:
  * `POST /contacts` — Add new contact.
  * `GET /contacts` — List all contacts for user.
  * `PUT /contacts/{id}` — Edit contact.
  * `DELETE /contacts/{id}` — Delete contact.
  * `PATCH /contacts/{id}/default` — Set contact as primary default.
* **Location**:
  * `POST /location/update` — Record live coordinates and address.
  * `GET /location/current` — Read latest recorded position.
* **SOS Emergency**:
  * `POST /sos/create` — Activate emergency incident with coordinates.
  * `GET /sos/history` — Read past incident log.
  * `GET /sos/{id}` — Incident details.
  * `PATCH /sos/{id}/cancel` — Cancel active incident.
  * `PATCH /sos/{id}/resolve` — Mark incident safely resolved.
* **Admin**:
  * `GET /admin/dashboard` — System statistics & recent alerts.
  * `GET /admin/users` — Roster of all registered users.
  * `GET /admin/incidents` — All emergencies across the platform.
  * `GET /admin/incidents/active` — Real-time active alerts only.
