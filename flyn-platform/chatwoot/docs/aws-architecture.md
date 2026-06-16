# Chatwoot on AWS Fargate – Architecture & Deployment Guide

## Overview
Deployed Chatwoot on AWS ECS Fargate with PostgreSQL RDS and Redis, reachable publicly on port 80. This document captures the full architecture, AWS resources, networking, and deployment steps.

---

## High-Level Architecture

```
Internet
   |
   v
[Public IP] → [ECS Fargate Task] → [Chatwoot (port 80)]
                     |
                     +---> [Redis (port 6379)]
                     |
                     +---> [PostgreSQL RDS (port 5432)]
```

---

## AWS Resources

### 1. ECS (Elastic Container Service)
- **Cluster**: `chatwoot`
- **Service**: `chatwoot` (desiredCount=1)
- **Task Definition Family**: `chatwoot`
- **Current Task Definition Revision**: `chatwoot:18`
- **Launch Type**: FARGATE
- **Network Mode**: awsvpc
- **CPU/Memory**: 1024 CPU, 2048 MiB
- **Execution Role**: `arn:aws:iam::<AWS_ACCOUNT_ID>:role/<ECS_TASK_EXECUTION_ROLE_NAME>`

#### Containers in Task
| Name      | Image                | Essential | Port Mappings | Command/EntryPoint |
|-----------|----------------------|-----------|---------------|-------------------|
| redis     | redis:7-alpine      | true      | 6379/tcp      | redis-server --save "" --appendonly no |
| chatwoot  | chatwoot/chatwoot:latest | true | 80/tcp        | sh -lc "set -e; bundle exec rails db:chatwoot_prepare; exec bundle exec rails s -b 0.0.0.0 -p 80" |

### 2. VPC & Networking
- **VPC ID**: `vpc-<VPC_ID>`
- **Subnet**: `subnet-<PUBLIC_SUBNET_ID>` (<AWS_REGION><AZ_SUFFIX>)
  - MapPublicIpOnLaunch: true
  - CIDR: 172.31.16.0/20
- **Internet Gateway**: `igw-<IGW_ID>`
- **Route Table**: `rtb-<ROUTE_TABLE_ID>`
  - 172.31.0.0/16 → local
  - 0.0.0.0/0 → `igw-<IGW_ID>`
- **Network ACL**: `acl-<NACL_ID>` (default allow all)

### 3. Security Groups
- **Chatwoot SG**: `sg-<SECURITY_GROUP_ID>` (chatwoot-public)
  - Inbound:
    - TCP 80 from 0.0.0.0/0
    - TCP 3000 from 0.0.0.0/0
  - Outbound: all traffic to 0.0.0.0/0

### 4. Databases
#### PostgreSQL RDS
- **Endpoint**: `<RDS_ENDPOINT>:5432`
- **Database**: `chatwoot`
- **User**: `chatwoot`
- **Engine**: PostgreSQL
- **Region**: `<AWS_REGION>`

#### Redis
- Deployed as a sidecar container in the same ECS task.
- No external Redis cluster is used.

### 5. Secrets Management
Stored in AWS Secrets Manager:
- `chatwoot/DATABASE_URL` → ARN: `arn:aws:secretsmanager:<AWS_REGION>:<AWS_ACCOUNT_ID>:secret:chatwoot/DATABASE_URL-<SUFFIX>`
- `chatwoot/SECRET_KEY_BASE` → ARN: `arn:aws:secretsmanager:<AWS_REGION>:<AWS_ACCOUNT_ID>:secret:chatwoot/SECRET_KEY_BASE-<SUFFIX>`

### 6. Logging
- **Log Group**: `/ecs/chatwoot`
- **Log Streams**:
  - `ecs/chatwoot/<task-id>`
  - `ecs/redis/<task-id>`
- Log Driver: awslogs

---

## Environment Variables (Chatwoot Container)

| Variable               | Value                                    |
|------------------------|------------------------------------------|
| RAILS_ENV              | production                               |
| NODE_ENV               | production                               |
| PORT                   | 80                                       |
| RAILS_LOG_TO_STDOUT    | true                                     |
| REDIS_URL              | redis://localhost:6379/0                 |
| FRONTEND_URL           | https://inbox.myflynai.com               |
| ALLOW_IFRAME_EMBED     | true                                     |
| DATABASE_URL           | (from Secrets Manager)                   |
| SECRET_KEY_BASE        | (from Secrets Manager)                   |

---

## Deployment Commands (Reference)

### 1. Register Task Definition (port 80 + db:chatwoot_prepare)
```bash
aws ecs register-task-definition \
  --region us-east-1 \
  --cli-input-json file:///tmp/chatwoot-taskdef-prepare-80.json
```

### 2. Update ECS Service
```bash
aws ecs update-service \
  --region <AWS_REGION> \
  --cluster chatwoot \
  --service chatwoot \
  --task-definition chatwoot:18 \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-<PUBLIC_SUBNET_ID>],securityGroups=[sg-<SECURITY_GROUP_ID>],assignPublicIp=ENABLED}" \
  --force-new-deployment
```

### 3. Wait for Stability
```bash
aws ecs wait services-stable \
  --region <AWS_REGION> \
  --cluster chatwoot \
  --services chatwoot
```

### 4. Get Public IP
```bash
TASK_ARN=$(aws ecs list-tasks --region us-east-1 --cluster chatwoot --service-name chatwoot --desired-status RUNNING --query "taskArns[0]" --output text)
ENI_ID=$(aws ecs describe-tasks --region us-east-1 --cluster chatwoot --tasks "$TASK_ARN" --query "tasks[0].attachments[0].details[?name==\`networkInterfaceId\`].value | [0]" --output text)
PUBLIC_IP=$(aws ec2 describe-network-interfaces --region us-east-1 --network-interface-ids "$ENI_ID" --query "NetworkInterfaces[0].Association.PublicIp" --output text)
echo "Public IP: $PUBLIC_IP"
```

---

## Access URLs
- **Public URL**: `http://<PUBLIC_IP>/`
- **Onboarding**: Redirects to `/installation/onboarding`

---

## Troubleshooting

### 1. View Logs
```bash
aws logs get-log-events \
  --region <AWS_REGION> \
  --log-group-name /ecs/chatwoot \
  --log-stream-name ecs/chatwoot/<task-id> \
  --limit 200 \
  --query "events[-120:].message" \
  --output text
```

### 2. Check Task Status
```bash
aws ecs describe-tasks \
  --region <AWS_REGION> \
  --cluster chatwoot \
  --tasks <task-arn> \
  --query "tasks[0].{lastStatus:lastStatus,containers:containers[*].{name:name,lastStatus:lastStatus,exitCode:exitCode,reason:reason}}" \
  --output json
```

### 3. Verify Security Group
```bash
aws ec2 describe-security-groups \
  --region <AWS_REGION> \
  --group-ids sg-<SECURITY_GROUP_ID> \
  --query "SecurityGroups[0].{groupId:GroupId,inbound:IpPermissions,outbound:IpPermissionsEgress}" \
  --output json
```

---

## Next Steps / Recommendations
1. **Domain + HTTPS**: Put Chatwoot behind an Application Load Balancer (ALB) with a custom domain and TLS certificate.
2. **Scaling**: Configure desiredCount > 1 and enable ECS Service Auto Scaling.
3. **Redis Cluster**: For production, use ElastiCache Redis instead of sidecar.
4. **Monitoring**: Enable CloudWatch Container Insights and set up alarms.
5. **Backup**: Enable automated backups for RDS PostgreSQL.

---

## Cost Notes
- ECS Fargate: Pay per vCPU-hour and GB-hour.
- RDS PostgreSQL: Instance size + storage.
- Data Transfer: Standard AWS rates for public traffic.

---

## Security Notes
- Secrets are stored in Secrets Manager (not plaintext).
- Public SG allows 80/3000 from the internet; tighten to your IP if needed.
- Consider using VPC endpoints for Secrets Manager to avoid internet traffic.

---

*Last Updated: 2026-01-27*
