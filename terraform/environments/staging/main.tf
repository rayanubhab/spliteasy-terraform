locals {
  name_prefix = "spliteasy-${var.environment}"
  common_tags = {
    Project     = "spliteasy"
    Environment = var.environment
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  single_nat_gateway = var.single_nat_gateway
  tags               = local.common_tags
}

module "alb" {
  source = "../../modules/alb"

  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  tags              = local.common_tags
}

# App security group lives at root so it can be shared between the ASG
# (instances) and RDS module (ingress rule) without a circular dependency.
resource "aws_security_group" "app" {
  name_prefix = "${local.name_prefix}-app-"
  vpc_id      = module.vpc.vpc_id
  description = "App instances - only reachable from the ALB"

  ingress {
    description     = "App port from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [module.alb.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-app-sg" })
}

module "secrets" {
  source = "../../modules/secrets"

  name_prefix = local.name_prefix
  tags        = local.common_tags
}

module "rds" {
  source = "../../modules/rds"

  name_prefix            = local.name_prefix
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  app_security_group_id  = aws_security_group.app.id
  db_username            = module.secrets.db_username
  db_password            = module.secrets.db_password
  instance_class         = var.db_instance_class
  multi_az               = var.db_multi_az
  deletion_protection    = var.db_deletion_protection
  skip_final_snapshot    = var.db_skip_final_snapshot
  tags                   = local.common_tags
}

module "asg" {
  source = "../../modules/asg"

  name_prefix            = local.name_prefix
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  app_security_group_id  = aws_security_group.app.id
  target_group_arn       = module.alb.target_group_arn
  db_host                = module.rds.db_endpoint
  db_port                = module.rds.db_port
  db_secret_arn          = module.secrets.secret_arn
  aws_region             = var.aws_region
  app_repo_url           = var.app_repo_url
  instance_type          = var.app_instance_type
  min_size               = var.asg_min_size
  max_size               = var.asg_max_size
  desired_capacity       = var.asg_desired_capacity
  tags                   = local.common_tags
}
