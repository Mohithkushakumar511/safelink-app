# SafeLink — Emergency Contact & Live Location Sharing System

This repository contains the complete **SafeLink** application inside the `SafeLink/` folder:

* **`SafeLink/frontend`**: Expo React Native mobile application.
* **`SafeLink/backend`**: FastAPI Python backend with MongoDB database.
* **`SafeLink/README.md`**: Detailed documentation, architecture, API reference, and setup guide.

### Quick Start:

1. **Start Backend**:
   ```bash
   cd SafeLink/backend
   python -m pip install -r requirements.txt
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

2. **Start Frontend**:
   ```bash
   cd SafeLink/frontend
   npm install
   npx expo start
   ```

For complete details, please read [SafeLink/README.md](file:///d:/emergency%20app/SafeLink/README.md).
