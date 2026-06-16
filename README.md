
Flyn is a comprehensive AI-driven business automation and orchestration platform. It enables businesses to deploy AI agents across multiple communication channels, manage complex workflows, and handle customer interactions seamlessly.

##  Architecture Overview

The platform is built on a modern full-stack architecture:

- **Frontend**: React + Vite + TypeScript. A fast, modular UI for managing tenants, agents, and deployments.
- **Backend**: NestJS (Node.js) + Firestore. A robust API orchestrating billing, telephony, AI provider integrations, and third-party services.
- **AI/LLM**: Support for Anthropic (Claude), Google (Gemini), and OpenAI.
- **Infrastructure**: Hosted on AWS App Runner with Firebase for Auth/Database and Stripe for Billing.

---

## Repository Structure

```text
flow-hub/
├── flyn-platform/           # Main Platform Code
│   ├── backend/             # NestJS + Firestore + Stripe orchestration
│   ├── frontend/            # React (Vite) dashboard and UI
│   ├── chatwoot/            # Chatwoot deployment assets & docs
│   └── lambda/               # AWS Lambda functions for specialized tasks
├── flyn-builder-complete-production/ # Visual builder for AI flows
├── docs/                     # Technical documentation & PRDs
└── scripts/                  # Management and automation scripts
```

---

##  Key Features & Modules

###  Billing & Plans
- **Canonical Tiers**: `starter`, `growth`, `professional`, `enterprise`.
- **Integration**: Fully integrated with Stripe for subscription management.
- **Claims System**: Automatic Firebase Custom Claims synchronization for entitlement gating.

###  Telephony & Voice
- **Flyn Voice Pool**: Instant self-service calling numbers via Twilio.
- **BYO Twilio**: Support for tenants to connect their own Twilio accounts.
- **AI Providers**: Integrated with Gemini and Vapi for real-time voice conversations.

###  Multichannel Integration
- **Social**: WhatsApp, Telegram, Facebook Messenger.
- **Platform**: Website Builder, SEO tools, and custom domain mapping.
- **Tooling**: Integrated with Chatwoot for human-in-the-loop support.

---

##  Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Firebase Project (Firestore, Auth enabled)
- Stripe Account (for billing features)

### 1. Backend Setup
```bash
cd flyn-platform/backend
npm install
cp .env.example .env
# Configure your Firebase Service Account and keys in .env
npm run start:dev
```
- **API URL**: `http://localhost:3000/api`

### 2. Frontend Setup
```bash
cd flyn-platform/frontend
npm install
npm run dev
```
- **Dashboard**: `http://localhost:8080`

### 3. Firebase Configuration
Ensure the following are enabled in the Firebase Console:
1. **Authentication**: Email/Password.
2. **Firestore**: Native mode.
3. **Admin SDK**: Generate a service account JSON and path it in `backend/.env`.

---

## 🚀 Deployment

The platform is designed for AWS deployment:
- **Backend**: Deployed on **AWS App Runner**.
- **Secrets**: Managed via **AWS Secrets Manager**.
- **Frontend**: Can be hosted on Netlify, Vercel, or AWS S3/CloudFront.

For detailed deployment steps, see [AWS_DEPLOYMENT_REFERENCE.md](AWS_DEPLOYMENT_REFERENCE.md).

---

## 📝 Maintenance & Workflow

- **Coding Standard**: Follow [CLAUDE.md](CLAUDE.md) for project-specific rules and git workflow.
- **Audit Logs**: See [FINAL_AUDIT_REPORT.md](FINAL_AUDIT_REPORT.md) for recent architectural changes.
- **Environment Reference**: See [flyn-platform/ENV_REFERENCE.md](flyn-platform/ENV_REFERENCE.md) for a full list of required keys.

---

## 📞 Support & Links
- **GitHub**: [anshtalrani88/flow-hub](https://github.com/anshtalrani88/flow-hub)
- **Live Backend**: `https://pjpmzvu7wn.us-east-1.awsapprunner.com/api`
# flyn
