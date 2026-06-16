# AWS Backend Deployment Reference

This document provides a verified reference for the current backend deployment of the Flyn Platform on AWS. These details are based on the actual configuration as of February 2, 2026.

## 1. Core Services

### AWS App Runner (Compute)
The backend is a containerized NestJS application running on **AWS App Runner**.
- **Service Name:** `flyn-backend`
- **Service ARN:** `arn:aws:apprunner:us-east-1:786150347998:service/flyn-backend/e756384049a04306842fb9369c11dba6`
- **Service URL:** `https://pjpmzvu7wn.us-east-1.awsapprunner.com`
- **Region:** `us-east-1`
- **Instance Configuration:**
  - **CPU:** 1 vCPU (1024)
  - **Memory:** 2 GB (2048)
  - **Instance Role:** `arn:aws:iam::786150347998:role/flyn-backend-apprunner-instance-role`

### Amazon ECR (Container Registry)
Docker images are stored in a private ECR repository.
- **Repository Name:** `flyn-backend`
- **Repository URI:** `786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend`
- **Current Active Tag:** `bootfix-20260202162737`

### AWS Secrets Manager
Sensitive credentials are stored securely and injected into the container at runtime.
- **Secret Name:** `flyn-backend/FIREBASE_SERVICE_ACCOUNT_B64`
- **Secret ARN:** `arn:aws:secretsmanager:us-east-1:786150347998:secret:flyn-backend/FIREBASE_SERVICE_ACCOUNT_B64-TopnlV`

---

## 2. Environment Configuration

### Plaintext Variables
These are configured directly in the App Runner Service configuration:
- `CORS_ORIGINS`: `https://app.myflynai.com`
- `NODE_ENV`: `production`
- `OWNER_BOOTSTRAP_SECRET`: `randombuildings@00`
- `OWNER_EMAILS`: `talraniansh@gmail.com,pulsebridge5@gmail.com`
- `PORT`: `3000`

### Secret Variables (RuntimeEnvironmentSecrets)
These are pulled from Secrets Manager and mapped to environment variables:
- `FIREBASE_SERVICE_ACCOUNT_B64`: Maps to the secret `flyn-backend/FIREBASE_SERVICE_ACCOUNT_B64`

---

## 3. IAM Roles and Permissions

### Instance Role
- **Name:** `flyn-backend-apprunner-instance-role`
- **Trust Policy:** Allows `tasks.apprunner.amazonaws.com` to assume the role.
- **Inline Policy (`FlynBackendReadFirebaseSecret`):**
  ```json
  {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Effect": "Allow",
              "Action": ["secretsmanager:GetSecretValue"],
              "Resource": ["arn:aws:secretsmanager:us-east-1:786150347998:secret:flyn-backend/FIREBASE_SERVICE_ACCOUNT_B64-TopnlV"]
          }
      ]
  }
  ```

### Access Role (ECR Pull)
- **Name:** `AppRunnerECRAccessRole`
- **Purpose:** Allows App Runner to pull images from ECR.

---

## 4. Deployment Workflow (How it was pushed)

1.  **Code Updates:** Backend changes were made in `flyn-platform/backend/`.
2.  **Docker Build (Local):**
    ```bash
    # Login to ECR
    aws ecr get-login-password --profile flyn-prod --region us-east-1 | docker login --username AWS --password-stdin 786150347998.dkr.ecr.us-east-1.amazonaws.com

    # Build for linux/amd64 (App Runner requirement)
    docker buildx build --platform linux/amd64 -t 786150347998.dkr.ecr.us-east-1.amazonaws.com/flyn-backend:bootfix-20260202162737 -f flyn-platform/backend/Dockerfile --push flyn-platform/backend
    ```
3.  **App Runner Update:**
    The service was updated to point to the new image tag using the AWS CLI or Console, ensuring all environment variables and the instance role remained correctly configured.

---

## 5. Important Endpoints
- **Base API:** `https://pjpmzvu7wn.us-east-1.awsapprunner.com/api`
- **Owner Bootstrap:** `POST /api/admin/bootstrap-owner`
  - Used to initialize the first owner account and set roles/passwords in Firebase.
