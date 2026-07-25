terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type    = string
  default = "asia-southeast1"
}

variable "bucket_name" {
  type        = string
  description = "Globally unique GCS bucket name for paste content"
}

variable "env" {
  type    = string
  default = "dev"
}

resource "google_storage_bucket" "content" {
  project  = var.project_id
  name     = var.bucket_name
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    app  = "pastebin"
    role = "content"
  }
}

output "bucket_name" {
  value = google_storage_bucket.content.name
}

output "bucket_url" {
  value = google_storage_bucket.content.url
}
