variable "region" {
  type    = string
  default = "us-east-1"
}

variable "image" {
  description = "The SAME flyn-backend image the App Runner service runs (set by gen-env.sh)."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the ALB + Fargate tasks (default VPC is fine)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the ALB + Fargate tasks (>=2, different AZs)."
  type        = list(string)
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "task_cpu" {
  type    = string
  default = "512"
}

variable "task_memory" {
  type    = string
  default = "1024"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "alb_ingress_cidrs" {
  description = "Who can reach the ALB. Lock to Cloudflare IP ranges in prod if desired."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# --- Populated by gen-env.sh (container-env.auto.tfvars.json, gitignored) ---
variable "container_env" {
  description = "Plain env vars copied from the App Runner service."
  type        = list(object({ name = string, value = string }))
  default     = []
}

variable "container_secrets" {
  description = "Secrets Manager refs copied from the App Runner service."
  type        = list(object({ name = string, valueFrom = string }))
  default     = []
}

variable "secret_arns" {
  description = "Secret ARNs the execution role may read (from gen-env.sh)."
  type        = list(string)
  default     = []
}

# --- Task runtime permissions ---
variable "task_role_policy_arns" {
  description = "Attach the SAME policies as flyn-backend-apprunner-instance-role."
  type        = list(string)
  default     = []
}

# --- TLS at the ALB (optional; recommended path is Cloudflare-proxied + HTTP:80) ---
variable "enable_https" {
  type    = bool
  default = false
}

variable "acm_certificate_arn" {
  description = "Required only if enable_https = true (cert for relay.myflynai.com)."
  type        = string
  default     = ""
}
