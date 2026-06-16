# 🚀 FlyNAI Builder - Complete Production Ready Package
## Vite + React (Frontend) | Next.js (Backend) | iframe Preview | Auto-Sync CMS | 200+ Features

**Version**: 3.0.0 - Complete  
**Date**: May 14, 2026  
**Status**: ✅ 100% Production Ready  
**License**: MIT (or your choice)

---

## 📦 WHAT'S INCLUDED

### **Complete Frontend (Vite + React + TypeScript)**
- ✅ 7 main builder components
- ✅ 8 overlay systems
- ✅ Real-time preview with iframe sandbox
- ✅ WebSocket integration
- ✅ CMS sync client
- ✅ Vite dev server & production build
- ✅ Responsive design
- ✅ Mobile-first UI

### **Complete Backend (Next.js + TypeScript)**
- ✅ All API routes (projects, pages, components, deployment, CMS)
- ✅ WebSocket preview sync server
- ✅ Auto-sync CMS service (default behavior)
- ✅ Code generation (12 frameworks)
- ✅ Deployment service (8+ platforms)
- ✅ Authentication (NextAuth)
- ✅ Database integration (Prisma + PostgreSQL)
- ✅ Validation & error handling

### **Database (PostgreSQL)**
- ✅ Prisma schema with migrations
- ✅ All required tables (projects, pages, components, CMS, deployments)
- ✅ Relationships & cascading deletes
- ✅ Indexes for performance

### **Real-Time Systems**
- ✅ **WebSocket Preview Sync** — iframe updates instantly as you build
- ✅ **Auto-Sync CMS** — Every change syncs to CMS automatically (no manual action)
- ✅ **Component Sync** — Changes reflected in preview immediately

### **Features (200+)**
- ✅ 6 builder modes (Website, Community & Charity, Marketplace, Membership, Blank, App)
- ✅ 160+ components (80 web + 80 mobile)
- ✅ Drag-drop interface
- ✅ Device preview modes (mobile/tablet/desktop)
- ✅ Zoom controls (40-150%)
- ✅ 8 overlay systems
- ✅ Agentic AI assistant
- ✅ Code generation
- ✅ Deployment
- ✅ Community & Charity features (28+)
- ✅ Event management
- ✅ Volunteer tracking
- ✅ Donation system
- ✅ CMS management
- ✅ Admin dashboard

### **Documentation**
- ✅ Complete Architecture Guide
- ✅ Setup Instructions
- ✅ API Documentation
- ✅ CMS Sync Guide
- ✅ Preview System Guide
- ✅ Deployment Guide
- ✅ Feature List

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌──────────────────────────┐
│  FRONTEND                 │
│  Vite + React + TS        │
│  (Cloudflare)             │
├──────────────────────────┤
│ BuilderApp               │
│ ├─ TopBar                │
│ ├─ LeftPanel (6 tabs)    │
│ ├─ CanvasFrame (iframe)  │
│ ├─ RightPanel (5 tabs)   │
│ ├─ AIPanel               │
│ └─ Overlays (8)          │
└──────┬───────────────────┘
       │ REST API
       ├─ PUT /api/builder/...
       │
       │ WebSocket
       └─ wss://api/ws
         (real-time preview)
┌──────┴───────────────────┐
│ BACKEND                   │
│ Next.js + TypeScript      │
│ (AWS Lambda/EC2)          │
├──────────────────────────┤
│ API Routes               │
│ ├─ Projects CRUD         │
│ ├─ Pages CRUD            │
│ ├─ Components CRUD       │
│ ├─ Preview (iframe)      │
│ ├─ Code Generation       │
│ ├─ Deployment            │
│ └─ WebSocket             │
│                          │
│ Services                 │
│ ├─ CMS Sync (AUTO)       │
│ ├─ Preview Sync          │
│ ├─ Code Generator        │
│ └─ Deployment            │
└──────┬───────────────────┘
       │ (AUTO-SYNC by default)
       │
┌──────┴───────────────────┐
│ CMS SYSTEM               │
│ (Any headless CMS)       │
├──────────────────────────┤
│ Collections              │
│ REST/GraphQL API         │
│ Publishing Workflow      │
└──────────────────────────┘
```

---

## 🔄 HOW IT WORKS

### **1. USER BUILDS SOMETHING**
```
User drags component onto canvas
  ↓
Change detected in CanvasFrame
  ↓
PUT /api/builder/[projectId]/components/[componentId]
```

### **2. BACKEND PROCESSES**
```
API route receives request
  ↓
Validates & authenticates
  ↓
Updates database
  ↓
Returns success
```

### **3. AUTO-SYNC CMS (AUTOMATIC)**
```
Trigger CMSSync service
  ↓
Generate CMS schema from component
  ↓
POST /api/cms/sync (with CMS_API_KEY)
  ↓
CMS receives & stores
  ✅ No user action needed
```

### **4. REAL-TIME PREVIEW (INSTANT)**
```
Broadcast via WebSocket
  ↓
PreviewSyncClient receives update
  ↓
iframe.postMessage(update)
  ↓
PreviewFrame re-renders component
  ✅ User sees change immediately
```

---

## 📋 QUICK START

### **Prerequisites**
- Node.js 18+
- PostgreSQL database (local or cloud)
- Git

### **Step 1: Setup Frontend**
```bash
cd frontend
npm install
npm run dev  # Runs on http://localhost:5173

# Build for production
npm run build  # Creates dist/
```

### **Step 2: Setup Backend**
```bash
cd backend
npm install

# Setup database
npx prisma migrate dev

# Configure environment (.env)
cp .env.example .env
# Edit with your settings

npm run dev  # Runs on http://localhost:3001
```

### **Step 3: Configure Environment**

**Frontend (.env.local):**
```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_PREVIEW_URL=http://localhost:3001/api/preview
```

**Backend (.env):**
```
DATABASE_URL=postgresql://user:pass@localhost:5432/flyn
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173

# CMS Auto-Sync
CMS_API_URL=https://cms.api/graphql
CMS_API_KEY=your-cms-key
AUTO_SYNC_ENABLED=true

# Services
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_...
```

### **Step 4: Run Locally**
```bash
# Terminal 1: Frontend
cd frontend && npm run dev

# Terminal 2: Backend
cd backend && npm run dev

# Access: http://localhost:5173
```

---

## 🚀 DEPLOYMENT

### **Frontend (Cloudflare Pages)**
```bash
cd frontend
npm run build
wrangler pages deploy dist/
```

### **Backend (AWS)**

**Option 1: AWS Lambda**
```bash
cd backend
npm run build
wrangler deploy
```

**Option 2: AWS EC2/ECS**
```bash
cd backend
docker build -t flyn-builder .
docker push YOUR_ECR_URL/flyn-builder:latest

# Push to AWS ECR, then deploy via ECS
```

---

## 📊 FILE STRUCTURE

```
flyn-builder/
├── frontend/
│   ├── src/
│   │   ├── components/builder/ (7 main components)
│   │   ├── components/overlays/ (8 overlay systems)
│   │   ├── components/preview/ (iframe content)
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── styles/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/
│   ├── app/
│   │   ├── api/ (all API routes)
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── cms-sync.ts (AUTO-SYNC service)
│   │   ├── preview-sync.ts (WebSocket server)
│   │   ├── code-generator.ts
│   │   └── deployment.ts
│   ├── types/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
└── docs/
    ├── ARCHITECTURE.md
    ├── SETUP.md
    ├── API.md
    ├── CMS-SYNC.md
    ├── PREVIEW.md
    ├── DEPLOYMENT.md
    └── FEATURES.md
```

---

## 🔐 KEY FEATURES

### **Real-Time Preview (WebSocket)**
- Instant feedback as you build
- No page reloads
- Component updates appear instantly in iframe
- Multi-user support (multiple builders on same project)

### **Auto-Sync CMS (Default)**
- Every change automatically syncs to CMS
- No manual "publish" or "sync" clicks
- GraphQL schema auto-generated
- Collections created automatically
- REST & GraphQL APIs available

### **Complete Builder**
- 6 modes (Website, Community, Marketplace, Membership, Blank, App)
- 160+ components ready to use
- Drag-drop interface
- Device preview (mobile/tablet/desktop)
- Responsive design
- Real-time code generation

### **Production Ready**
- Fully typed TypeScript
- Error handling & validation
- Authentication & authorization
- Database migrations
- Deployment to 8+ platforms
- Monitoring & logging

---

## 💻 TECHNOLOGY STACK

| Layer | Technology | Environment |
|-------|-----------|-------------|
| **Frontend** | Vite + React 18 + TypeScript | Cloudflare Pages |
| **Backend** | Next.js 14 + TypeScript | AWS (Lambda/EC2/ECS) |
| **Database** | PostgreSQL + Prisma | AWS RDS |
| **Real-Time** | WebSocket | AWS (same backend) |
| **CMS Sync** | Node.js service | Automatic (no setup) |
| **Preview** | iframe sandbox | Isolated environment |

---

## 📚 DOCUMENTATION

See the `/docs` folder for complete guides:

- **ARCHITECTURE.md** — System design & data flow
- **SETUP.md** — Step-by-step setup instructions
- **API.md** — All API endpoints
- **CMS-SYNC.md** — How auto-sync works
- **PREVIEW.md** — WebSocket & iframe system
- **DEPLOYMENT.md** — Deploy to production
- **FEATURES.md** — Complete feature list

---

## 🎯 WHAT YOU CAN BUILD

With FlyNAI Builder, ANY organization can create:

### **Websites**
- Blogs, portfolios, SaaS
- Marketing sites
- E-commerce stores
- Landing pages

### **Community Platforms**
- Nonprofit websites
- Charity platforms
- Volunteer networks
- Faith communities
- Social impact orgs

### **Marketplaces**
- Job boards
- Vendor directories
- Gig platforms
- Product marketplaces

### **Mobile Apps**
- iOS apps (Swift)
- Android apps (Kotlin)
- React Native apps

### **And More**
- Membership sites
- Content platforms
- Learning platforms
- Event management sites

**All with the same builder. Just customize the features you need.**

---

## ✅ TESTING

```bash
# Frontend tests
cd frontend
npm run test

# Backend tests
cd backend
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

---

## 🐛 TROUBLESHOOTING

### **Preview not updating?**
- Check WebSocket connection in Network tab
- Verify `VITE_WS_URL` is correct
- Check backend console for errors

### **CMS not syncing?**
- Verify `CMS_API_URL` and `CMS_API_KEY` in .env
- Check `AUTO_SYNC_ENABLED=true`
- See CMS sync logs in database: `cms_sync_logs` table

### **Build errors?**
- Verify Node.js version (18+)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check all environment variables are set

---

## 🤝 SUPPORT

- 📚 **Docs** — Full documentation in `/docs`
- 🤖 **AI Assistant** — Built-in help in the builder
- 💻 **Code** — All source code is well-commented
- 📧 **Email** — Support templates included

---

## 📄 LICENSE

[Your chosen license - MIT, Apache 2.0, etc.]

---

## 🎉 YOU'RE READY!

This package contains everything needed to:
✅ Run FlyNAI Builder locally  
✅ Build websites & apps  
✅ Deploy to production  
✅ Sync with CMS automatically  
✅ Get real-time preview updates  
✅ Generate code in 12 frameworks  
✅ Deploy to 8+ platforms  

**Start building now!** 🚀

---

**Questions?** Check the documentation in `/docs` or use the AI assistant in the builder.

**Happy building!** 💚

