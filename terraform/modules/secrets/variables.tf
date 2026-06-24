variable "name_prefix" {
  type = string
}

variable "db_username" {
  type    = string
  default = "app_admin"
}

variable "tags" {
  type    = map(string)
  default = {}
}
