output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "db_port" {
  value = aws_db_instance.main.port
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}
