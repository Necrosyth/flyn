# AWS Current Backend Setup (Observed via AWS CLI)

## Scope

This document captures the *current* backend deployment setup as observed in AWS via CLI.
It intentionally avoids including any secrets (access keys, secret values, private keys).

## Profile / Account / Region

- AWS profile: `flyn-prod`
- AWS account: `786150347998`
- Region: `us-east-1`

## Backend Runtime

### AWS App Runner Service

- Service name: `flyn-backend`
- Service ARN: `arn:aws:apprunner:us-east-1:786150347998:service/flyn-backend/e756384049a04306842fb9369c11dba6`
- Service URL: `https://pjpmzvu7wn.us-east-1.awsapprunner.com`
- Status: `RUNNING`
- Public accessibility: `true`

#### Source / Image

- Source type: ECR image
- Image identifier:
  - `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend:20260115011703`
- Auto deployments: `disabled` (`AutoDeploymentsEnabled=false`)
- ECR access role:
  - `arn:aws:iam::786150347998:role/AppRunnerECRAccessRole`

#### Container Port

- Port: `3000`

#### Runtime Environment Variables (non-secret)

These were returned by `aws apprunner describe-service`:

- `CORS_ORIGINS=https://app.myflynai.com`
- `NODE_ENV=production`

#### Health Check

- Protocol: `HTTP`
- Path: `/api`
- Interval: `10s`
- Timeout: `5s`
- Healthy threshold: `1`
- Unhealthy threshold: `5`

#### Instance Sizing

- CPU: `1024`
- Memory: `2048`

#### Networking

- Ingress: publicly accessible
- Egress: default
- IP address type: `IPV4`

#### App Runner Operations (recent)

- `CREATE_SERVICE` (succeeded)
- `START_DEPLOYMENT` (succeeded)

#### CloudWatch Log Groups

Discovered log groups (prefix: `/aws/apprunner`):

- `/aws/apprunner/flyn-backend/54e3c7f8e8e34c309575d74761dc7136/application`
- `/aws/apprunner/flyn-backend/54e3c7f8e8e34c309575d74761dc7136/service`
- `/aws/apprunner/flyn-backend/e756384049a04306842fb9369c11dba6/application`
- `/aws/apprunner/flyn-backend/e756384049a04306842fb9369c11dba6/service`

## Related AWS Resources (likely backend dependencies)

### ECR

- Repo: `flyn-backend`
- Repo URI: `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend`
- Latest observed tag used by App Runner: `20260115011703`

### Secrets Manager

- No secrets were found matching `backend`, `flyn`, or `firebase` name filters in this account/region.
  - This does not prove there are none, only that none matched those name filters.

## Notes / Implications

- The backend is *not* deployed as an ECS service in this account/region; it is deployed via **App Runner**.
- If you want to change backend environment variables, do it in **App Runner** (`SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables`) or via whatever automation/script you use to update the service.
