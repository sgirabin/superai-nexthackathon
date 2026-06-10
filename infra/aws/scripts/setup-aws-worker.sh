#!/usr/bin/env bash
set -euo pipefail

# Deploy a minimal AWS Lambda + HTTP API and write its public URL into apps/web/.env.local
# Requirements: AWS CLI v2 configured (credentials in env or ~/.aws/), jq optional
# Usage: ./scripts/setup-aws-worker.sh

ROLE_NAME="career-kaki-lambda-role"
FUNCTION_NAME="career-kaki-worker"
API_NAME="career-kaki-http-api"
STAGE_NAME='$default'
REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="$ROOT_DIR/.aws-worker-temp"
ENV_FILE="$ROOT_DIR/apps/web/.env.local"

echo "This script will create AWS resources (IAM Role, Lambda, API Gateway) in region: $REGION"
read -r -p "Continue? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborting. No changes made."
  exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "aws CLI not found. Install and configure AWS CLI v2 first."; exit 2; }

rm -rf "$WORKDIR" && mkdir -p "$WORKDIR"
cat > "$WORKDIR/index.mjs" <<'LAMBDA'
export const handler = async (event) => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'CareerKaki AWS worker OK' }),
  };
};
LAMBDA

pushd "$WORKDIR" >/dev/null
zip -r function.zip index.mjs >/dev/null
popd >/dev/null

# Create IAM role if not exists
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "IAM role $ROLE_NAME exists"
else
  echo "Creating IAM role $ROLE_NAME"
  TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST_POLICY" --region "$REGION" >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
  # Wait for IAM role propagation
  echo "Waiting for IAM role propagation..."
  sleep 5
fi

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# Create or update Lambda function
if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "Updating existing Lambda function $FUNCTION_NAME"
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file fileb://"$WORKDIR/function.zip" --region "$REGION" >/dev/null
else
  echo "Creating Lambda function $FUNCTION_NAME"
  aws lambda create-function --function-name "$FUNCTION_NAME" --runtime nodejs18.x --handler index.handler --zip-file fileb://"$WORKDIR/function.zip" --role "$ROLE_ARN" --region "$REGION" >/dev/null
fi

# Create HTTP API
API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text 2>/dev/null || echo "none")
if [ "$API_ID" = "None" ] || [ "$API_ID" = "none" ] || [ -z "$API_ID" ]; then
  echo "Creating HTTP API $API_NAME"
  API_ID=$(aws apigatewayv2 create-api --name "$API_NAME" --protocol-type HTTP --region "$REGION" --query 'ApiId' --output text)
else
  echo "Found existing API $API_NAME -> $API_ID"
fi

# Create integration
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id "$API_ID" --query "Items[?IntegrationType=='AWS_PROXY' && contains(IntegrationUri, '$FUNCTION_NAME')].IntegrationId | [0]" --output text 2>/dev/null || echo "none")
if [ "$INTEGRATION_ID" = "None" ] || [ "$INTEGRATION_ID" = "none" ] || [ -z "$INTEGRATION_ID" ]; then
  echo "Creating integration for Lambda -> API"
  LAMBDA_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)
  # IntegrationUri must be of format arn:aws:apigateway:{region}:lambda:path/2015-03-31/functions/{lambdaArn}/invocations
  INTEGRATION_URI="arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations"
  INTEGRATION_ID=$(aws apigatewayv2 create-integration --api-id "$API_ID" --integration-type AWS_PROXY --integration-uri "$INTEGRATION_URI" --payload-format-version 2.0 --region "$REGION" --query 'IntegrationId' --output text)
else
  echo "Integration exists: $INTEGRATION_ID"
fi

# Create route GET /
ROUTE_ID=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query "Items[?RouteKey=='GET /'].RouteId | [0]" --output text 2>/dev/null || echo "none")
if [ "$ROUTE_ID" = "None" ] || [ "$ROUTE_ID" = "none" ] || [ -z "$ROUTE_ID" ]; then
  echo "Creating route GET /"
  ROUTE_ID=$(aws apigatewayv2 create-route --api-id "$API_ID" --route-key 'GET /' --target "integrations/$INTEGRATION_ID" --region "$REGION" --query 'RouteId' --output text)
else
  echo "Route exists: $ROUTE_ID"
fi

# Create default route to catch empty or non-root paths
DEFAULT_ROUTE_KEY='$default'
DEFAULT_ROUTE_ID=$(aws apigatewayv2 get-routes --api-id "$API_ID" --query "Items[?RouteKey=='$DEFAULT_ROUTE_KEY'].RouteId | [0]" --output text 2>/dev/null || echo "none")
if [ "$DEFAULT_ROUTE_ID" = "None" ] || [ "$DEFAULT_ROUTE_ID" = "none" ] || [ -z "$DEFAULT_ROUTE_ID" ]; then
  echo "Creating default route $DEFAULT_ROUTE_KEY"
  DEFAULT_ROUTE_ID=$(aws apigatewayv2 create-route --api-id "$API_ID" --route-key "$DEFAULT_ROUTE_KEY" --target "integrations/$INTEGRATION_ID" --region "$REGION" --query 'RouteId' --output text)
else
  echo "Default route exists: $DEFAULT_ROUTE_ID"
fi

# Create deployment & stage
DEPLOYMENT_ID=$(aws apigatewayv2 create-deployment --api-id "$API_ID" --region "$REGION" --query 'DeploymentId' --output text)
STAGE_EXISTS=$(aws apigatewayv2 get-stages --api-id "$API_ID" --region "$REGION" --query "Items[?StageName=='$STAGE_NAME'].StageName | [0]" --output text 2>/dev/null || echo "none")
if [ "$STAGE_EXISTS" = "None" ] || [ "$STAGE_EXISTS" = "none" ] || [ -z "$STAGE_EXISTS" ]; then
  aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name "$STAGE_NAME" --deployment-id "$DEPLOYMENT_ID" --region "$REGION" >/dev/null
else
  echo "Updating existing stage $STAGE_NAME"
  aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name "$STAGE_NAME" --deployment-id "$DEPLOYMENT_ID" --region "$REGION" >/dev/null
fi

# Grant permission for API Gateway to invoke Lambda
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
API_URI="https://$API_ID.execute-api.$REGION.amazonaws.com"
PERM_STATEMENT_ID="apigw-invoke-$API_ID"
if aws lambda get-policy --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "Lambda already has a policy; attempting to add permission if needed"
fi
aws lambda add-permission --function-name "$FUNCTION_NAME" --statement-id "$PERM_STATEMENT_ID" --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*/" --region "$REGION" >/dev/null 2>/tmp/aws-add-perm.err || true
if grep -q 'Statement id.*already exists' /tmp/aws-add-perm.err 2>/dev/null; then
  echo "Lambda add-permission statement already exists; skipping"
else
  rm -f /tmp/aws-add-perm.err
fi

# Write NEXT_PUBLIC_AWS_WORKER_URL to apps/web/.env.local
cat > "$ENV_FILE" <<EOF
# Auto-generated by scripts/setup-aws-worker.sh
NEXT_PUBLIC_AWS_WORKER_URL=$API_URI
EOF

echo "AWS worker deployed at: $API_URI"
echo "Wrote apps/web/.env.local with NEXT_PUBLIC_AWS_WORKER_URL"

echo "Cleanup temporary files"
rm -rf "$WORKDIR"

echo "Done. To run frontend with this worker URL, start dev in apps/web:" 
echo "  cd apps/web && npm run dev"

exit 0
