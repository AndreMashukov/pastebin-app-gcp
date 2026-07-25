output "events_topic_name" {
  value = module.event_hub.topic_name
}

output "events_topic_id" {
  value = module.event_hub.topic_id
}

output "content_bucket_name" {
  value = module.content_bucket.bucket_name
}

output "author_bff_url" {
  value = module.author_bff.service_url
}

output "public_bff_url" {
  value = module.public_bff.service_url
}

output "reaper_url" {
  value = module.reaper.service_url
}

output "publisher_service_account" {
  value = module.event_hub.publisher_service_account_email
}

output "subscriber_service_account" {
  value = module.event_hub.subscriber_service_account_email
}
