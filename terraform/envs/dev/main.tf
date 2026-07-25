# terraform/envs/dev/main.tf
#
# Compose event-hub, content bucket, author/public/reaper services.

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com",
    "eventarc.googleapis.com",
    "pubsub.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "cloudscheduler.googleapis.com",
    "identitytoolkit.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

module "event_hub" {
  source         = "../../modules/event-hub"
  project_id     = var.project_id
  region         = var.region
  topic_name     = "pastebin-events"
  dlq_topic_name = "pastebin-events-dlq"
}

module "content_bucket" {
  source      = "../../modules/content-bucket"
  project_id  = var.project_id
  region      = var.region
  bucket_name = var.content_bucket_name
  env         = var.env
}

resource "google_secret_manager_secret" "smoke_test_key" {
  project   = var.project_id
  secret_id = "pastebin-smoke-test-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "smoke_test_key" {
  secret      = google_secret_manager_secret.smoke_test_key.id
  secret_data = var.smoke_test_key
}

locals {
  smoke_test_secret_env = {
    SMOKE_TEST_KEY = {
      secret_name = google_secret_manager_secret.smoke_test_key.secret_id
      version     = "latest"
    }
  }
  common_service_env = merge(var.common_env_vars, {
    GCP_PROJECT_ID = var.project_id
    GCP_REGION     = var.region
    CONTENT_BUCKET = module.content_bucket.bucket_name
    DOMAIN         = var.public_domain
  })
}

module "author_bff" {
  source     = "../../modules/bff-service"
  project_id = var.project_id
  region     = var.region

  project_number = data.google_project.this.number

  service_name          = "author-bff"
  image                 = var.author_bff_image
  allow_unauthenticated = true

  firestore_database_id          = "author-db"
  firestore_location             = var.region
  firestore_trigger_path_pattern = "pastes/{pasteId}"
  enable_firestore_trigger       = true
  enable_pubsub_publisher        = true
  content_bucket_name            = module.content_bucket.bucket_name

  events_topic_id           = module.event_hub.topic_id
  events_topic_name         = module.event_hub.topic_name
  subscribes_to_event_types = []

  env_vars = merge(local.common_service_env, {
    SERVICE_NAME   = "author-bff"
    EVENTHUB_TOPIC = module.event_hub.topic_name
  })
  secret_env_vars = local.smoke_test_secret_env

  deletion_protection = false
}

module "public_bff" {
  source     = "../../modules/bff-service"
  project_id = var.project_id
  region     = var.region

  project_number = data.google_project.this.number

  service_name          = "public-bff"
  image                 = var.public_bff_image
  allow_unauthenticated = true

  firestore_database_id    = "public-db"
  firestore_location       = var.region
  enable_firestore_trigger = false
  content_bucket_name      = module.content_bucket.bucket_name

  events_topic_id           = module.event_hub.topic_id
  events_topic_name         = module.event_hub.topic_name
  subscribes_to_event_types = ["paste.created", "paste.deleted"]

  env_vars = merge(local.common_service_env, {
    SERVICE_NAME   = "public-bff"
    EVENTHUB_TOPIC = module.event_hub.topic_name
  })

  deletion_protection = false
}

module "reaper" {
  source     = "../../modules/bff-service"
  project_id = var.project_id
  region     = var.region

  project_number = data.google_project.this.number

  service_name              = "reaper"
  image                     = var.reaper_image
  allow_unauthenticated     = false
  create_firestore_database = false
  firestore_database_id     = "author-db"
  enable_firestore_trigger  = false
  content_bucket_name       = module.content_bucket.bucket_name

  events_topic_id           = module.event_hub.topic_id
  events_topic_name         = module.event_hub.topic_name
  subscribes_to_event_types = []

  env_vars = merge(local.common_service_env, {
    SERVICE_NAME = "reaper"
  })

  deletion_protection = false
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_reaper_invoker" {
  project  = var.project_id
  location = var.region
  name     = module.reaper.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${module.reaper.service_account_email}"
}

resource "google_cloud_scheduler_job" "reaper" {
  project     = var.project_id
  region      = var.region
  name        = "pastebin-reaper"
  description = "Delete expired pastes every 5 minutes"
  schedule    = "*/5 * * * *"

  http_target {
    http_method = "POST"
    uri         = "${module.reaper.service_url}/reap"

    oidc_token {
      service_account_email = module.reaper.service_account_email
      audience              = module.reaper.service_url
    }
  }

  depends_on = [google_cloud_run_v2_service_iam_member.scheduler_reaper_invoker]
}
