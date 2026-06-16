# 🚀 FLYN Platform Setup Guide

## Current Issues & Solutions

### ✅ Fixed
- React Router warnings (added future flags)
- Missing marketing components (created all 6 components)

### ⚠️ Needs Configuration

## 1. Backend Setup

### Step 1: Get Firebase Service Account
1. Go to https://console.firebase.google.com/project/flyn-138fa/settings/serviceaccounts/adminsdk
2. Click **Generate new private key**
3. Save as `backend/serviceAccount.json`

### Step 2: Configure Backend Environment
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```dotenv
# Point to your service account file
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccount.json

# OR use base64 (run: cat serviceAccount.json | base64 -w 0)
# FIREBASE_SERVICE_ACCOUNT_B64=your_base64_string

# Server config
PORT=3000
CORS_ORIGINS=http://localhost:8080

# Chatwoot (optional - only if using)
CHATWOOT_BASE_URL=http://localhost:3000
CHATWOOT_MASTER_API_TOKEN=
```

### Step 3: Install & Start Backend
```bash
cd backend
npm install
npm run start:dev
```

Backend will run on: `http://localhost:3000`

## 2. Firebase Console Setup

### Enable Authentication
1. Go to https://console.firebase.google.com/project/flyn-138fa/authentication
2. Click **Get started** (if not already initialized)
3. Go to **Sign-in method** tab
4. Enable **Email/Password**
5. Click **Save**

### Verify Configuration
Your frontend is already configured with:
- ✅ API Key: `YOUR_API_KEY`
- ✅ Auth Domain: `flyn-138fa.firebaseapp.com`
- ✅ Project ID: `flyn-138fa`
- ✅ App ID: `1:762653464707:web:8bc1eab0004c70f58e23b6`

## 3. Running the Platform

### Terminal 1: Backend
```bash
cd /home/tushar-harsan/Desktop/Projects/FLYN/flow-hub/flyn-platform/backend
npm run start:dev
```

### Terminal 2: Frontend
```bash
cd /home/tushar-harsan/Desktop/Projects/FLYN/flow-hub/flyn-platform/frontend
npm run dev
```

### Access
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

## 4. Testing Signup Flow

1. Open http://localhost:8080/signup
2. Enter:
   - Company Name: `Test Company`
   - Email: `test@example.com`
   - Password: `Test123!@#`
3. Click **Sign Up**

### Expected Flow
1. Frontend creates Firebase user
2. Frontend calls backend `/api/tenants/provision`
3. Backend creates tenant record
4. Backend sets Firebase custom claims
5. Frontend navigates to `/onboarding`

## Troubleshooting

### "Failed to load resource: net::ERR_CONNECTION_REFUSED"
- ❌ Backend is not running
- ✅ Start backend with `npm run start:dev` in backend folder

### "auth/configuration-not-found"
- ❌ Firebase Authentication not initialized
- ✅ Go to Firebase Console → Authentication → Get started

### "Firebase: Error (auth/email-already-in-use)"
- ✅ User already exists - use different email or delete user in Firebase Console

### Backend errors about Firebase Admin
- ❌ Service account not configured
- ✅ Download service account JSON and configure in backend/.env

## Quick Check Commands

```bash
# Check if backend is running
curl http://localhost:3000

# Check if frontend is running  
curl http://localhost:8080

# Check environment variables (frontend)
cat frontend/.env

# Check environment variables (backend)
cat backend/.env
```

## Next Steps After Setup

1. Complete user signup
2. Go through onboarding flow
3. Configure additional features:
   - Stripe integration
   - Chatwoot integration
   - Module permissions

## Need Help?

- Firebase Console: https://console.firebase.google.com/project/flyn-138fa
- Backend logs: Check terminal running `npm run start:dev`
- Frontend logs: Check browser console (F12)
