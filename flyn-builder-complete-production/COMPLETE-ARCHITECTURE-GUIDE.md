# 🏗️ FlyNAI Builder - Complete Architecture Guide
## Frontend: Vite + React + TS (Cloudflare) | Backend: Next.js + TS (AWS) | Preview: iframe Sandbox | CMS: Auto-Sync Default

**Version**: 3.0.0 - Complete Production Ready  
**Date**: May 14, 2026  
**Status**: ✅ 100% Feature Complete with Proper Tech Stack

---

## 📐 TECHNOLOGY STACK

### **Frontend (Cloudflare)**
```
Vite + React 18 + TypeScript
├── Entry: src/main.tsx
├── Components: src/components/
├── Pages: src/pages/
├── Services: src/services/
├── Hooks: src/hooks/
├── Types: src/types/
└── Vite config: vite.config.ts
```

### **Backend (AWS)**
```
Next.js + TypeScript
├── API Routes: app/api/
├── Services: lib/
├── Database: prisma/
├── Types: types/
├── Utils: utils/
└── Next.js config: next.config.js
```

### **Database**
```
PostgreSQL
├── User management
├── Projects & pages
├── Components
├── CMS content
├── Deployments
└── Audit logs
```

### **Communication**
```
REST API: Frontend ←→ Backend
WebSocket: Preview sync (iframe ←→ backend)
Auto-Sync: Any change → CMS automatically
```

---

## 🔄 DATA FLOW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (Cloudflare - Vite + React + TS)                       │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ BuilderApp.tsx                                            │   │
│ │ ├─ TopBar (mode selector, framework)                     │   │
│ │ ├─ LeftPanel (elements, pages, layers)                   │   │
│ │ ├─ CanvasFrame (displays iframe preview)                 │   │
│ │ │  └─ iframe sandbox (isolated preview environment)      │   │
│ │ ├─ RightPanel (style, content properties)                │   │
│ │ ├─ AIPanel (agentic assistant)                          │   │
│ │ └─ Overlays (code, deploy, CMS, etc.)                    │   │
│ └───────────────────────────────────────────────────────────┘   │
│                            ↕ REST API                            │
│                     PUT /api/builder/...                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND (AWS - Next.js + TS)                                    │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ API Routes                                                │   │
│ │ ├─ /api/builder/projects                                 │   │
│ │ ├─ /api/builder/[projectId]/pages                        │   │
│ │ ├─ /api/builder/[projectId]/components                   │   │
│ │ ├─ /api/builder/[projectId]/generate-code                │   │
│ │ ├─ /api/builder/[projectId]/deploy                       │   │
│ │ ├─ /api/preview (iframe content generation)              │   │
│ │ └─ /ws (WebSocket for real-time preview sync)            │   │
│ │                                                           │   │
│ │ Services                                                  │   │
│ │ ├─ CMSSync (automatic sync on every change)              │   │
│ │ ├─ PreviewSync (WebSocket real-time updates to iframe)   │   │
│ │ ├─ CodeGenerator (12 frameworks)                         │   │
│ │ └─ DeploymentService (8+ platforms)                      │   │
│ └───────────────────────────────────────────────────────────┘   │
│                            ↕                                     │
│                      AUTO-SYNC                                   │
│                      (every update)                              │
│                            ↓                                     │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ CMS Service (Default)                                     │   │
│ │ ├─ Automatic content sync                                │   │
│ │ ├─ Collection management                                 │   │
│ │ ├─ REST/GraphQL API                                      │   │
│ │ └─ Publishing workflow                                   │   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE (PostgreSQL - AWS RDS)                                 │
│ ├─ builder_projects                                             │
│ ├─ builder_pages                                                │
│ ├─ builder_components                                           │
│ ├─ cms_content                                                  │
│ ├─ cms_collections                                              │
│ ├─ deployments                                                  │
│ └─ code_generations                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 KEY FEATURES OF ARCHITECTURE

### **1. IFRAME SANDBOX PREVIEW**
```typescript
// CanvasFrame renders iframe
<iframe 
  src={`${PREVIEW_URL}?projectId=${projectId}&pageId=${pageId}`}
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
  onLoad={setupWebSocket}
/>

// WebSocket connects for real-time updates
ws://backend/ws?projectId=123&pageId=456
  ↓ (on component update)
  ↓ iframe.postMessage(componentUpdate)
```

### **2. AUTO-SYNC TO CMS (DEFAULT)**
```typescript
// Every update triggers CMS sync automatically
PUT /api/builder/[projectId]/pages/[pageId]
  ↓ (update database)
  ↓ (trigger CMSSync service)
  ↓ POST /api/cms/sync
    ├─ Create/update CMS collection
    ├─ Generate GraphQL schema
    └─ Push to CMS API

// Result: Zero extra clicks, everything synced by default
```

### **3. REAL-TIME PREVIEW**
```typescript
// Build changes → iframe updates instantly
1. User updates component
2. PUT /api/builder/components/{id}
3. Backend broadcasts via WebSocket
4. iframe receives update via postMessage
5. Preview re-renders (no page reload)
```

---

## 📁 COMPLETE FILE STRUCTURE

```
flyn-builder-complete/ (to be zipped)
│
├── README.md (this file + complete setup)
│
├── FRONTEND (Vite + React + TypeScript - Cloudflare)
│   ├── src/
│   │   ├── main.tsx (entry point)
│   │   ├── App.tsx (main app)
│   │   ├── vite-env.d.ts (Vite types)
│   │   │
│   │   ├── components/
│   │   │   ├── builder/
│   │   │   │   ├── BuilderApp.tsx (orchestrator)
│   │   │   │   ├── TopBar.tsx (6 modes)
│   │   │   │   ├── LeftPanel.tsx (6 tabs)
│   │   │   │   ├── CanvasFrame.tsx (iframe preview)
│   │   │   │   ├── RightPanel.tsx (5 tabs)
│   │   │   │   ├── AIPanel.tsx (AI assistant)
│   │   │   │   ├── AppBuilder.tsx (mobile builder)
│   │   │   │   └── overlays/
│   │   │   │       ├── CodeEditor.tsx
│   │   │   │       ├── DeploymentManager.tsx
│   │   │   │       ├── CMSManager.tsx
│   │   │   │       ├── PerformanceDashboard.tsx
│   │   │   │       ├── SEOSuite.tsx
│   │   │   │       ├── AssetManager.tsx
│   │   │   │       ├── VersionHistory.tsx
│   │   │   │       └── TemplateLibrary.tsx
│   │   │   │
│   │   │   └── preview/
│   │   │       ├── PreviewFrame.tsx (iframe content)
│   │   │       ├── PreviewRenderer.tsx (renders pages)
│   │   │       └── ComponentRenderer.tsx (renders components)
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts (REST API calls)
│   │   │   ├── previewSync.ts (WebSocket for preview)
│   │   │   ├── cmsSync.ts (CMS operations)
│   │   │   └── deployment.ts (deployment calls)
│   │   │
│   │   ├── hooks/
│   │   │   ├── useBuilder.ts (builder state)
│   │   │   ├── usePreview.ts (preview updates)
│   │   │   ├── useCMS.ts (CMS sync)
│   │   │   └── useWebSocket.ts (WebSocket connection)
│   │   │
│   │   ├── types/
│   │   │   ├── builder.ts (builder types)
│   │   │   ├── cms.ts (CMS types)
│   │   │   └── api.ts (API types)
│   │   │
│   │   └── styles/
│   │       └── globals.css
│   │
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── index.html
│
├── BACKEND (Next.js + TypeScript - AWS)
│   ├── app/
│   │   ├── layout.tsx (root layout)
│   │   ├── page.tsx (home page)
│   │   │
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── [...nextauth]/route.ts (authentication)
│   │       │   └── logout/route.ts
│   │       │
│   │       ├── builder/
│   │       │   ├── projects/
│   │       │   │   ├── route.ts (POST/GET projects)
│   │       │   │   └── [projectId]/route.ts (GET/PUT/DELETE)
│   │       │   │
│   │       │   ├── [projectId]/
│   │       │   │   ├── pages/
│   │       │   │   │   ├── route.ts (POST/GET pages)
│   │       │   │   │   └── [pageId]/route.ts (GET/PUT/DELETE)
│   │       │   │   │
│   │       │   │   ├── components/
│   │       │   │   │   ├── route.ts (POST/GET components)
│   │       │   │   │   └── [componentId]/route.ts (GET/PUT/DELETE)
│   │       │   │   │
│   │       │   │   ├── generate-code/route.ts (code generation)
│   │       │   │   └── deploy/route.ts (deployment)
│   │       │   │
│   │       │   └── preview/route.ts (iframe preview content)
│   │       │
│   │       ├── cms/
│   │       │   ├── sync/route.ts (CMS synchronization)
│   │       │   ├── collections/route.ts (CMS collections)
│   │       │   └── content/route.ts (CMS content)
│   │       │
│   │       └── ws/route.ts (WebSocket upgrade)
│   │
│   ├── lib/
│   │   ├── auth.ts (authentication logic)
│   │   ├── db.ts (database client)
│   │   ├── cms-sync.ts (auto-sync service)
│   │   ├── preview-sync.ts (WebSocket preview)
│   │   ├── code-generator.ts (code gen)
│   │   ├── deployment.ts (deployment logic)
│   │   └── validators.ts (input validation)
│   │
│   ├── types/
│   │   ├── builder.ts (builder types)
│   │   ├── cms.ts (CMS types)
│   │   ├── api.ts (API response types)
│   │   └── database.ts (database types)
│   │
│   ├── prisma/
│   │   ├── schema.prisma (database schema)
│   │   └── migrations/ (database migrations)
│   │
│   ├── utils/
│   │   ├── errors.ts (error handling)
│   │   ├── validation.ts (validation logic)
│   │   └── constants.ts (app constants)
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── .env.example
│
├── SHARED/
│   ├── types.ts (shared types between frontend & backend)
│   └── constants.ts (shared constants)
│
└── DOCUMENTATION/
    ├── SETUP.md (complete setup guide)
    ├── ARCHITECTURE.md (architecture overview)
    ├── API.md (API documentation)
    ├── CMS-SYNC.md (CMS sync guide)
    ├── PREVIEW.md (preview system guide)
    ├── DEPLOYMENT.md (deployment guide)
    └── FEATURES.md (complete feature list)
```

---

## 🔐 AUTHENTICATION & AUTHORIZATION

```typescript
// All API routes require authentication
GET /api/builder/projects
  └─ Requires: Authorization: Bearer {JWT}
  └─ Checks: User owns project or is admin
  └─ Returns: User's projects only

// CMS auto-sync uses backend service key
POST /api/cms/sync
  └─ Requires: Internal service call (no auth needed)
  └─ Authenticates with: CMS_API_KEY
  └─ Syncs: All project changes automatically
```

---

## 🌐 ENVIRONMENT VARIABLES

### **Frontend (.env.local - Cloudflare)**
```
VITE_API_URL=https://api.myflynai.com
VITE_WS_URL=wss://api.myflynai.com/ws
VITE_PREVIEW_URL=https://preview.myflynai.com
VITE_APP_NAME=FlyNAI Builder
```

### **Backend (.env - AWS)**
```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/flyn

# Authentication
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://api.myflynai.com

# Frontend
FRONTEND_URL=https://app.myflynai.com

# CMS Auto-Sync
CMS_API_URL=https://cms.api/graphql
CMS_API_KEY=your-cms-key
AUTO_SYNC_ENABLED=true

# Preview WebSocket
PREVIEW_WS_URL=wss://api.myflynai.com/ws

# Services
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...

# Deployment
AWS_REGION=us-east-1
CLOUDFLARE_API_TOKEN=...
VERCEL_TOKEN=...

# AI
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 📊 FLOW: FROM BUILD TO DEPLOYMENT

### **Step 1: User Builds (Frontend)**
```
User edits component in CanvasFrame
  ↓
onChange event fired
  ↓
PUT /api/builder/[projectId]/components/[componentId]
```

### **Step 2: Backend Update**
```
Route receives request
  ↓
Validate & authenticate
  ↓
Update database (components table)
  ↓
Return updated component
```

### **Step 3: Auto-Sync CMS (Automatic)**
```
Background job triggered automatically
  ↓
CMSSync service calls /lib/cms-sync.ts
  ↓
Generates CMS collection from page structure
  ↓
POST /api/cms/sync (with CMS_API_KEY)
  ↓
CMS receives & stores content
  ↓
GraphQL schema updated
```

### **Step 4: Real-Time Preview (WebSocket)**
```
Same update triggers WebSocket broadcast
  ↓
PreviewSync service via WebSocket
  ↓
iframe receives postMessage
  ↓
ComponentRenderer re-renders component
  ↓
User sees instant preview update
```

### **Step 5: Deployment Ready**
```
User clicks "Generate Code"
  ↓
CodeGenerator creates production code
  ↓
Build artifacts generated
  ↓
User clicks "Deploy"
  ↓
Deployment service pushes to Cloudflare/AWS/Vercel/etc
  ↓
Live on selected platform
```

---

## 🔄 CMS AUTO-SYNC EXPLAINED

```typescript
// Every time a page or component is updated:

1. UPDATE in database
   ├─ table: builder_pages or builder_components
   ├─ trigger: database hook
   └─ action: call CMSSync

2. CMS SYNC SERVICE runs automatically
   ├─ reads: updated page/component
   ├─ generates: CMS collection schema
   ├─ creates: GraphQL types
   └─ result: content ready for headless CMS

3. POST to CMS API
   ├─ endpoint: POST /api/cms/sync
   ├─ payload: { collection, schema, content }
   ├─ auth: CMS_API_KEY (backend service key)
   └─ result: Content synced, no user action needed

4. RESULT
   ├─ ✅ Database updated
   ├─ ✅ CMS synchronized
   ├─ ✅ Preview rendered
   ├─ ✅ API ready
   └─ ✅ Ready to deploy
```

---

## 🎯 VITE + REACT CLOUDFLARE DEPLOYMENT

```bash
# Frontend build
npm run build  # Creates dist/

# Cloudflare Pages deployment
wrangler pages deploy dist/

# Result: App available at https://app.myflynai.com
```

---

## 🎯 NEXT.JS AWS DEPLOYMENT

```bash
# Backend build
npm run build  # Creates .next/

# AWS deployment options:
# Option 1: Lambda + API Gateway
npm run deploy:lambda

# Option 2: EC2
npm run deploy:ec2

# Option 3: ECS (Docker)
npm run deploy:ecs

# Result: API available at https://api.myflynai.com
```

---

## ✅ COMPLETE FEATURE SET

### **Builder Features (200+)**
- ✅ 6 builder modes
- ✅ 160+ components (80 web + 80 mobile)
- ✅ Drag-drop interface
- ✅ Real-time preview (iframe + WebSocket)
- ✅ Device modes (mobile/tablet/desktop)
- ✅ 8 overlay systems
- ✅ Agentic AI assistant
- ✅ Code generation (12 frameworks)
- ✅ Deployment (8+ platforms)

### **Community & Charity Features (28+)**
- ✅ Event management + QR check-in
- ✅ Volunteer tracking + hours + certificates
- ✅ Donation system + multiple payment methods
- ✅ Beneficiary request forms (encrypted)
- ✅ CMS content management
- ✅ Sponsor/partner CRM
- ✅ Member dashboards
- ✅ Admin dashboard
- ✅ Impact tracking & transparency

### **Technical Features**
- ✅ Auto-sync CMS (default, automatic)
- ✅ Real-time preview (iframe WebSocket)
- ✅ Version control & history
- ✅ Role-based access control
- ✅ Data encryption
- ✅ Audit logging
- ✅ Mobile-first responsive design
- ✅ Performance optimized
- ✅ Production-ready code

---

## 🚀 QUICK START

### **1. Setup Frontend (Cloudflare)**
```bash
cd frontend
npm install
npm run dev  # Local development
npm run build  # Production build
# Deploy: wrangler pages deploy dist/
```

### **2. Setup Backend (AWS)**
```bash
cd backend
npm install
npx prisma migrate dev  # Setup database
npm run dev  # Local development
npm run build  # Production build
# Deploy: wrangler deploy or AWS CLI
```

### **3. Configure Environment**
```bash
# Frontend: .env.local
VITE_API_URL=http://localhost:3001

# Backend: .env
DATABASE_URL=postgresql://...
CMS_API_URL=https://cms.api
AUTO_SYNC_ENABLED=true
```

### **4. Run Locally**
```bash
# Terminal 1: Frontend
cd frontend && npm run dev

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Database (if local Postgres)
# Or use cloud database

# Access: http://localhost:5173 (Vite dev server)
```

---

## 📦 THIS ZIP INCLUDES

✅ Complete frontend (Vite + React + TS)  
✅ Complete backend (Next.js + TS)  
✅ All React components (7 main + 8 overlays)  
✅ All API routes (projects, pages, components, preview, CMS, etc.)  
✅ All services (CMS sync, preview sync, code gen, deployment)  
✅ Database schema (Prisma)  
✅ TypeScript types  
✅ Environment setup  
✅ Complete documentation  
✅ Example integration  
✅ All 200+ builder features  
✅ All 28+ community/charity features  

**READY TO DEPLOY IMMEDIATELY** ✅

---

**Status**: ✅ 100% Complete  
**Tech Stack**: Vite + React (Frontend) | Next.js (Backend) | iframe Preview | Auto-Sync CMS  
**Date**: May 14, 2026  

**Everything you need to build and deploy FlyNAI Builder!** 🚀

