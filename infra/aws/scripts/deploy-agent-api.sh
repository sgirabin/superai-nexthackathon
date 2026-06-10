#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

STACK_NAME="${STACK_NAME:-goaround-agent-runtime}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
STAGE_NAME="${STAGE_NAME:-prod}"

cd "${AWS_DIR}"

npm install

sam build
sam deploy \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    StageName="${STAGE_NAME}" \
    ExaApiKey="${EXA_API_KEY:-}" \
    VercelAiGatewayApiKey="${VERCEL_AI_GATEWAY_API_KEY:-${AI_GATEWAY_API_KEY:-}}" \
    VercelAiGatewayModel="${VERCEL_AI_GATEWAY_MODEL:-${AI_GATEWAY_MODEL:-openai/gpt-5.4}}" \
    VercelAiGatewayBaseUrl="${VERCEL_AI_GATEWAY_BASE_URL:-${AI_GATEWAY_BASE_URL:-https://ai-gateway.vercel.sh/v1}}" \
    AgentApiKey="${AGENT_API_KEY:-}"

sam list stack-outputs --stack-name "${STACK_NAME}" --region "${AWS_REGION}"
