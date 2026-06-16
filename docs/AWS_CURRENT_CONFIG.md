# AWS Current Configuration (Observed via AWS CLI)

## Profile

- AWS profile: `flyn-prod`
- AWS account: `786150347998`
- Primary region with resources discovered: `us-east-1`

## App Runner

### Backend (NestJS)

- Service name: `flyn-backend`
- Service ARN: `arn:aws:apprunner:us-east-1:786150347998:service/flyn-backend/e756384049a04306842fb9369c11dba6`
- Service URL: `https://pjpmzvu7wn.us-east-1.awsapprunner.com`
- Status: `RUNNING`
- Container image (ECR):
  - `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend:20260115011703`
- Container port: `3000`
- Runtime env vars (non-secret):
  - `CORS_ORIGINS=https://app.myflynai.com`
  - `NODE_ENV=production`
- Health check:
  - `GET /api`
- Instance size:
  - CPU: `1024`
  - Memory: `2048`

## ECS

### Chatwoot

- Cluster: `chatwoot`
- Service: `chatwoot`
- Desired tasks: `1`
- Running tasks: `1`
- Launch type: Fargate (service uses `awsvpc`)
- Network:
  - Subnet(s): `subnet-0a51411e63ff86269`
  - Security group(s): `sg-09249004ec18d4067`
  - Public IP: `ENABLED`
- Task definition: `chatwoot:18`

#### Task definition (chatwoot:18)

- CPU: `1024`
- Memory: `2048`
- Network mode: `awsvpc`
- Execution role ARN: `arn:aws:iam::786150347998:role/chatwoot-ecs-task-role`
- Containers:
  - `redis`: `redis:7-alpine` (port 6379)
  - `chatwoot`: `chatwoot/chatwoot:latest` (port 80)
- Notable env vars in `chatwoot` container:
  - `FRONTEND_URL=https://inbox.myflynai.com`
  - `REDIS_URL=redis://localhost:6379/0`
  - `PORT=80`
- Secrets (AWS Secrets Manager) injected into `chatwoot` container:
  - `chatwoot/DATABASE_URL`
  - `chatwoot/SECRET_KEY_BASE`

### Backend (NestJS)

- The backend is deployed via **App Runner** (see `## App Runner` above), not ECS.

## ECR

Repositories discovered in `us-east-1`:
- `chatwoot` → `786150347998.dkr.ecr.us-east-1.amazonaws.com/chatwoot`
- `ai-expeditor` → `786150347998.dkr.ecr.us-east-1.amazonaws.com/ai-expeditor`
- `flyn-backend` → `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend`

## Secrets Manager

Secret names discovered in `us-east-1`:
- `chatwoot/DATABASE_URL`
- `chatwoot/SECRET_KEY_BASE`

## RDS

Instances discovered in `us-east-1`:

- Identifier: `chatwoot-db`
  - Engine: `postgres`
  - Endpoint: `chatwoot-db.cebo8g4g2sj5.us-east-1.rds.amazonaws.com`
  - Publicly accessible: `false`
  - VPC: `vpc-05deba20cd8266d69`

## Load Balancers

- No ELBv2 load balancers were returned by `aws elbv2 describe-load-balancers` in `us-east-1` under this profile.

## Route53 / API Gateway / Lambda / EC2

- Route53 hosted zones: none returned in this account (may be managed elsewhere)
- API Gateway (REST): none returned in this region
- Lambda functions: none returned in this region
- Running EC2 instances: none returned in this region
