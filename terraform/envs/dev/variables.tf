variable "project_id" {
  type        = string
  description = "GCP project id for the dev environment"
  default     = "your-gcp-project-id"
}

variable "region" {
  type        = string
  description = "GCP region for all dev resources"
  default     = "asia-southeast1"
}

variable "env" {
  type        = string
  description = "Environment name (used in labels and resource naming)"
  default     = "dev"
}

variable "artifact_registry_repo" {
  type        = string
  description = "Artifact Registry repository id for the BFF container images"
  default     = "pastebin-apps-dev"
}

variable "content_bucket_name" {
  type        = string
  description = "Globally unique GCS bucket name for paste content"
  default     = "your-gcp-project-id-pastebin-content-dev"
}

variable "public_domain" {
  type        = string
  description = "Public paste URL domain returned by POST /pastes"
  default     = "paste.example.com"
}

variable "author_bff_image" {
  type        = string
  description = "Container image for author-bff"
  default     = "asia-southeast1-docker.pkg.dev/your-gcp-project-id/pastebin-apps-dev/author-bff:latest"
}

variable "public_bff_image" {
  type        = string
  description = "Container image for public-bff"
  default     = "asia-southeast1-docker.pkg.dev/your-gcp-project-id/pastebin-apps-dev/public-bff:latest"
}

variable "reaper_image" {
  type        = string
  description = "Container image for reaper"
  default     = "asia-southeast1-docker.pkg.dev/your-gcp-project-id/pastebin-apps-dev/reaper:latest"
}

variable "common_env_vars" {
  type = map(string)
  default = {
    ENV    = "dev"
    REGION = "asia-southeast1"
  }
}

variable "smoke_test_key" {
  type        = string
  sensitive   = true
  description = "Dev-only X-Smoke-Test bypass value. Set in terraform.tfvars — no default."
}
