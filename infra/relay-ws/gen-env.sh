#!/usr/bin/env bash
# Pull the live flyn-backend App Runner env/secrets/image into a Terraform
# auto-tfvars file so the Fargate task is byte-identical — WITHOUT committing
# any secret values (the output is gitignored).
#
# Requires: aws CLI (logged into account 786150347998), jq.
# Usage:    ./gen-env.sh
set -euo pipefail

SERVICE_ARN="arn:aws:apprunner:us-east-1:786150347998:service/flyn-backend/e756384049a04306842fb9369c11dba6"
OUT="container-env.auto.tfvars.json"

echo "Reading App Runner service config…"
desc="$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --region us-east-1)"

img="$(echo "$desc"   | jq -r '.Service.SourceConfiguration.ImageRepository.ImageIdentifier')"
env_json="$(echo "$desc" | jq -c '[(.Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables // {}) | to_entries[] | {name: .key, value: .value}]')"
sec_json="$(echo "$desc" | jq -c '[(.Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets // {}) | to_entries[] | {name: .key, valueFrom: .value}]')"
arns_json="$(echo "$desc" | jq -c '[(.Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets // {}) | to_entries[] | .value]')"

jq -n \
  --arg img "$img" \
  --argjson env "$env_json" \
  --argjson sec "$sec_json" \
  --argjson arns "$arns_json" \
  '{image: $img, container_env: $env, container_secrets: $sec, secret_arns: $arns}' > "$OUT"

echo "Wrote $OUT (gitignored)"
echo "  image:   $img"
echo "  env vars: $(echo "$env_json" | jq 'length')"
echo "  secrets:  $(echo "$sec_json" | jq 'length')"
echo
echo "Next: set vpc_id + public_subnet_ids + task_role_policy_arns in terraform.tfvars, then 'terraform apply'."
