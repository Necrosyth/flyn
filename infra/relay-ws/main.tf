###############################################################################
# Flyn voice-AI relay — WebSocket-capable host (ECS Fargate + ALB)
#
# WHY: App Runner cannot accept inbound WebSockets (its Envoy proxy 403s the
# upgrade). ConversationRelay needs a persistent WS. This stack runs the SAME
# flyn-backend image on Fargate behind an ALB (which passes WebSockets) and
# exposes ONLY the relay WS endpoint. All other traffic stays on App Runner.
#
# Env/secrets are NOT hardcoded — run ./gen-env.sh first to pull them from the
# live App Runner service into container-env.auto.tfvars.json (gitignored).
# See README.md.
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = "flyn-relay-ws"
}

# ---- Logs ----------------------------------------------------------------
resource "aws_cloudwatch_log_group" "relay" {
  name              = "/ecs/${local.name}"
  retention_in_days = 14
}

# ---- IAM -----------------------------------------------------------------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull image from ECR, write logs, read the referenced secrets.
resource "aws_iam_role" "exec" {
  name               = "${local.name}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "exec_managed" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "exec_secrets" {
  count = length(var.secret_arns) > 0 ? 1 : 0
  name  = "${local.name}-secrets-read"
  role  = aws_iam_role.exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.secret_arns
    }]
  })
}

# Task role: the app's runtime AWS permissions (S3, DynamoDB, etc.).
# Attach the SAME policies as the App Runner instance role
# (flyn-backend-apprunner-instance-role) via var.task_role_policy_arns.
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_extra" {
  for_each   = toset(var.task_role_policy_arns)
  role       = aws_iam_role.task.name
  policy_arn = each.value
}

# ---- Security groups -----------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "ALB ingress for relay WS"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP (Cloudflare in front terminates TLS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidrs
  }

  dynamic "ingress" {
    for_each = var.enable_https ? [1] : []
    content {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.alb_ingress_cidrs
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "svc" {
  name        = "${local.name}-svc"
  description = "Fargate task - ingress from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "container port from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---- ALB -----------------------------------------------------------------
resource "aws_lb" "relay" {
  name               = local.name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  idle_timeout       = 4000 # CRITICAL: keep the call's WebSocket open through silences
}

resource "aws_lb_target_group" "relay" {
  name                 = local.name
  port                 = var.container_port
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 30

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.relay.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.relay.arn
  }
}

resource "aws_lb_listener" "https" {
  count             = var.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.relay.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.relay.arn
  }
}

# ---- ECS Fargate ---------------------------------------------------------
resource "aws_ecs_cluster" "relay" {
  name = local.name
}

resource "aws_ecs_task_definition" "relay" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "relay"
    image        = var.image
    essential    = true
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    # PORT is forced to the container port; the rest comes from gen-env.sh.
    environment = concat(
      [{ name = "PORT", value = tostring(var.container_port) }],
      var.container_env
    )
    secrets = var.container_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.relay.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "relay"
      }
    }
  }])
}

resource "aws_ecs_service" "relay" {
  name            = local.name
  cluster         = aws_ecs_cluster.relay.id
  task_definition = aws_ecs_task_definition.relay.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.svc.id]
    assign_public_ip = true # public subnets → needs a public IP to pull from ECR
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.relay.arn
    container_name   = "relay"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
}
