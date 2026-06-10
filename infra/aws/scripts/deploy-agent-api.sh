#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${AWS_DIR}/../.." && pwd)"
WEB_ENV_FILE="${REPO_DIR}/apps/web/.env.local"

STACK_NAME="${STACK_NAME:-goaround-agent-runtime}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
STAGE_NAME="${STAGE_NAME:-prod}"

cd "${AWS_DIR}"

if [ -f "${WEB_ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${WEB_ENV_FILE}"
  set +a
fi

rm -rf .sam-local-packages
mkdir -p .sam-local-packages
cp -R "${REPO_DIR}/packages/agent-core" .sam-local-packages/agent-core

npm install

export PATH="${AWS_DIR}/node_modules/.bin:${PATH}"

PARAMETER_OVERRIDES=(
  "StageName=${STAGE_NAME}"
)

if [ -n "${EXA_API_KEY:-}" ]; then
  PARAMETER_OVERRIDES+=("ExaApiKey=${EXA_API_KEY}")
fi

if [ -n "${VERCEL_AI_GATEWAY_API_KEY:-${AI_GATEWAY_API_KEY:-}}" ]; then
  PARAMETER_OVERRIDES+=("VercelAiGatewayApiKey=${VERCEL_AI_GATEWAY_API_KEY:-${AI_GATEWAY_API_KEY:-}}")
fi

if [ -n "${VERCEL_AI_GATEWAY_MODEL:-${AI_GATEWAY_MODEL:-}}" ]; then
  PARAMETER_OVERRIDES+=("VercelAiGatewayModel=${VERCEL_AI_GATEWAY_MODEL:-${AI_GATEWAY_MODEL:-}}")
fi

if [ -n "${VERCEL_AI_GATEWAY_BASE_URL:-${AI_GATEWAY_BASE_URL:-}}" ]; then
  PARAMETER_OVERRIDES+=("VercelAiGatewayBaseUrl=${VERCEL_AI_GATEWAY_BASE_URL:-${AI_GATEWAY_BASE_URL:-}}")
fi

if [ -n "${AGENT_API_KEY:-}" ]; then
  PARAMETER_OVERRIDES+=("AgentApiKey=${AGENT_API_KEY}")
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ARTIFACT_BUCKET="${SAM_ARTIFACT_BUCKET:-goaround-sam-artifacts-${ACCOUNT_ID}-${AWS_REGION}}"
TABLE_NAME="${AGENT_RUNS_TABLE:-GoAroundAgentRuns}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-goaround-agent-runtime-lambda-role}"
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-goaround-agent-runtime}"
API_NAME="${HTTP_API_NAME:-goaround-agent-runtime-api}"

deploy_direct() {
  local direct_dir=".aws-direct"
  local function_zip="${direct_dir}/function.zip"
  local trust_policy="${direct_dir}/trust-policy.json"
  local env_file="${direct_dir}/lambda-env.json"
  local ddb_policy="${direct_dir}/dynamodb-policy.json"

  echo "Deploying directly with AWS CLI because SAM managed resources are not allowed in this account."

  rm -rf "${direct_dir}"
  mkdir -p "${direct_dir}"

  esbuild src/agent-handler.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=esm \
    --outfile="${direct_dir}/index.mjs" \
    --sourcemap

  (cd "${direct_dir}" && zip -q function.zip index.mjs index.mjs.map)

  local dynamodb_enabled="true"
  if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "DynamoDB table exists: ${TABLE_NAME}"
  else
    echo "Creating DynamoDB table: ${TABLE_NAME}"
    if aws dynamodb create-table \
      --table-name "${TABLE_NAME}" \
      --billing-mode PAY_PER_REQUEST \
      --attribute-definitions AttributeName=runId,AttributeType=S \
      --key-schema AttributeName=runId,KeyType=HASH \
      --region "${AWS_REGION}" >/dev/null; then
      aws dynamodb wait table-exists --table-name "${TABLE_NAME}" --region "${AWS_REGION}"
    else
      echo "DynamoDB table creation is not allowed. Continuing without run logging."
      dynamodb_enabled="false"
    fi
  fi

  cat > "${trust_policy}" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
    echo "IAM role exists: ${ROLE_NAME}"
  else
    echo "Creating IAM role: ${ROLE_NAME}"
    aws iam create-role \
      --role-name "${ROLE_NAME}" \
      --assume-role-policy-document "file://${trust_policy}" \
      --region "${AWS_REGION}" >/dev/null
    aws iam attach-role-policy \
      --role-name "${ROLE_NAME}" \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
    sleep 8
  fi

  cat > "${ddb_policy}" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}"
    }
  ]
}
JSON

  if [ "${dynamodb_enabled}" = "true" ]; then
    aws iam put-role-policy \
      --role-name "${ROLE_NAME}" \
      --policy-name GoAroundAgentRunsAccess \
      --policy-document "file://${ddb_policy}" \
      --region "${AWS_REGION}" >/dev/null
  fi

  local role_arn
  role_arn="$(aws iam get-role --role-name "${ROLE_NAME}" --query Role.Arn --output text)"

  cat > "${env_file}" <<JSON
{
  "Variables": {
    "AGENT_RUNS_TABLE": "$([ "${dynamodb_enabled}" = "true" ] && printf "%s" "${TABLE_NAME}")",
    "EXA_API_KEY": "${EXA_API_KEY:-}",
    "EXA_API_BASE_URL": "${EXA_API_BASE_URL:-https://api.exa.ai}",
    "VERCEL_AI_GATEWAY_API_KEY": "${VERCEL_AI_GATEWAY_API_KEY:-${AI_GATEWAY_API_KEY:-}}",
    "VERCEL_AI_GATEWAY_MODEL": "${VERCEL_AI_GATEWAY_MODEL:-${AI_GATEWAY_MODEL:-openai/gpt-5.4}}",
    "VERCEL_AI_GATEWAY_BASE_URL": "${VERCEL_AI_GATEWAY_BASE_URL:-${AI_GATEWAY_BASE_URL:-https://ai-gateway.vercel.sh/v1}}",
    "AGENT_API_KEY": "${AGENT_API_KEY:-}"
  }
}
JSON

  if aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "Updating Lambda function: ${FUNCTION_NAME}"
    aws lambda update-function-code \
      --function-name "${FUNCTION_NAME}" \
      --zip-file "fileb://${function_zip}" \
      --region "${AWS_REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}"
    aws lambda update-function-configuration \
      --function-name "${FUNCTION_NAME}" \
      --runtime nodejs20.x \
      --handler index.handler \
      --timeout 20 \
      --memory-size 1024 \
      --environment "file://${env_file}" \
      --region "${AWS_REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}"
  else
    echo "Creating Lambda function: ${FUNCTION_NAME}"
    aws lambda create-function \
      --function-name "${FUNCTION_NAME}" \
      --runtime nodejs20.x \
      --handler index.handler \
      --architectures arm64 \
      --role "${role_arn}" \
      --zip-file "fileb://${function_zip}" \
      --timeout 20 \
      --memory-size 1024 \
      --environment "file://${env_file}" \
      --region "${AWS_REGION}" >/dev/null
  fi

  local function_arn
  function_arn="$(aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}" --query Configuration.FunctionArn --output text)"

  local api_id
  api_id="$(aws apigatewayv2 get-apis --region "${AWS_REGION}" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text 2>/dev/null || true)"
  if [ -z "${api_id}" ] || [ "${api_id}" = "None" ]; then
    echo "Creating HTTP API: ${API_NAME}"
    api_id="$(aws apigatewayv2 create-api \
      --name "${API_NAME}" \
      --protocol-type HTTP \
      --cors-configuration AllowOrigins='*',AllowMethods=POST,OPTIONS,AllowHeaders=content-type,x-api-key \
      --region "${AWS_REGION}" \
      --query ApiId \
      --output text)"
  else
    echo "HTTP API exists: ${API_NAME} -> ${api_id}"
  fi

  local integration_uri integration_id
  integration_uri="arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${function_arn}/invocations"
  integration_id="$(aws apigatewayv2 get-integrations --api-id "${api_id}" --region "${AWS_REGION}" --query "Items[?IntegrationUri=='${integration_uri}'].IntegrationId | [0]" --output text 2>/dev/null || true)"
  if [ -z "${integration_id}" ] || [ "${integration_id}" = "None" ]; then
    echo "Creating Lambda integration"
    integration_id="$(aws apigatewayv2 create-integration \
      --api-id "${api_id}" \
      --integration-type AWS_PROXY \
      --integration-uri "${integration_uri}" \
      --payload-format-version 2.0 \
      --region "${AWS_REGION}" \
      --query IntegrationId \
      --output text)"
  else
    echo "Lambda integration exists: ${integration_id}"
  fi

  local route_id
  route_id="$(aws apigatewayv2 get-routes --api-id "${api_id}" --region "${AWS_REGION}" --query "Items[?RouteKey=='POST /agent/chat'].RouteId | [0]" --output text 2>/dev/null || true)"
  if [ -z "${route_id}" ] || [ "${route_id}" = "None" ]; then
    echo "Creating route: POST /agent/chat"
    aws apigatewayv2 create-route \
      --api-id "${api_id}" \
      --route-key "POST /agent/chat" \
      --target "integrations/${integration_id}" \
      --region "${AWS_REGION}" >/dev/null
  else
    echo "Route exists: POST /agent/chat"
  fi

  local deployment_id stage_exists
  deployment_id="$(aws apigatewayv2 create-deployment --api-id "${api_id}" --region "${AWS_REGION}" --query DeploymentId --output text)"
  stage_exists="$(aws apigatewayv2 get-stages --api-id "${api_id}" --region "${AWS_REGION}" --query "Items[?StageName=='${STAGE_NAME}'].StageName | [0]" --output text 2>/dev/null || true)"
  if [ -z "${stage_exists}" ] || [ "${stage_exists}" = "None" ]; then
    echo "Creating stage: ${STAGE_NAME}"
    aws apigatewayv2 create-stage \
      --api-id "${api_id}" \
      --stage-name "${STAGE_NAME}" \
      --deployment-id "${deployment_id}" \
      --region "${AWS_REGION}" >/dev/null
  else
    echo "Updating stage: ${STAGE_NAME}"
    aws apigatewayv2 update-stage \
      --api-id "${api_id}" \
      --stage-name "${STAGE_NAME}" \
      --deployment-id "${deployment_id}" \
      --region "${AWS_REGION}" >/dev/null
  fi

  local statement_id="apigw-invoke-${api_id}"
  aws lambda add-permission \
    --function-name "${FUNCTION_NAME}" \
    --statement-id "${statement_id}" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${api_id}/*/*/agent/chat" \
    --region "${AWS_REGION}" >/dev/null 2>/tmp/goaround-add-permission.err || true

  if grep -q "already exists" /tmp/goaround-add-permission.err 2>/dev/null; then
    echo "Lambda invoke permission already exists"
  elif [ -s /tmp/goaround-add-permission.err ]; then
    cat /tmp/goaround-add-permission.err >&2
    return 1
  fi
  rm -f /tmp/goaround-add-permission.err

  local api_url="https://${api_id}.execute-api.${AWS_REGION}.amazonaws.com/${STAGE_NAME}/agent/chat"
  echo "Agent API deployed: ${api_url}"
  echo "Set AWS_AGENT_API_URL=${api_url}"
}

if aws s3api head-bucket --bucket "${ARTIFACT_BUCKET}" 2>/dev/null; then
  echo "Using existing SAM artifact bucket: ${ARTIFACT_BUCKET}"
else
  echo "Creating SAM artifact bucket: ${ARTIFACT_BUCKET}"
  if [ "${AWS_REGION}" = "us-east-1" ]; then
    if ! aws s3api create-bucket --bucket "${ARTIFACT_BUCKET}" --region "${AWS_REGION}" >/dev/null; then
      deploy_direct
      exit $?
    fi
  else
    if ! aws s3api create-bucket \
      --bucket "${ARTIFACT_BUCKET}" \
      --region "${AWS_REGION}" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}" >/dev/null; then
      deploy_direct
      exit $?
    fi
  fi
fi

sam build
sam deploy \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_IAM \
  --s3-bucket "${ARTIFACT_BUCKET}" \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMETER_OVERRIDES[@]}" || {
    deploy_direct
    exit $?
  }

sam list stack-outputs --stack-name "${STACK_NAME}" --region "${AWS_REGION}"
