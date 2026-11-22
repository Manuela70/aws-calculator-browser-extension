#!/usr/bin/env bash
# infra/scripts/gha-assume-role.sh — Credenciales temporales de AWS para un job de
# GitHub Actions por OIDC (cicd-pipeline.md §2 y §5): sin claves guardadas en
# GitHub. Pide el token OIDC del job (requiere `permissions: id-token: write`),
# asume el rol indicado con AWS STS y exporta las credenciales temporales al
# entorno del job, enmascaradas en el registro.
# Uso: bash infra/scripts/gha-assume-role.sh <role-arn> <region>
set -euo pipefail

role_arn="${1:?falta el ARN del rol}"
region="${2:?falta la región}"

if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
  echo "El job no tiene permiso id-token: write" >&2
  exit 1
fi

oidc_token="$(curl -sSf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r '.value')"
echo "::add-mask::${oidc_token}"

credentials="$(aws sts assume-role-with-web-identity \
  --region "${region}" \
  --role-arn "${role_arn}" \
  --role-session-name "github-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
  --web-identity-token "${oidc_token}" \
  --duration-seconds 3600 \
  --query 'Credentials' --output json)"

access_key="$(jq -r '.AccessKeyId' <<<"${credentials}")"
secret_key="$(jq -r '.SecretAccessKey' <<<"${credentials}")"
session_token="$(jq -r '.SessionToken' <<<"${credentials}")"
echo "::add-mask::${access_key}"
echo "::add-mask::${secret_key}"
echo "::add-mask::${session_token}"

{
  echo "AWS_ACCESS_KEY_ID=${access_key}"
  echo "AWS_SECRET_ACCESS_KEY=${secret_key}"
  echo "AWS_SESSION_TOKEN=${session_token}"
  echo "AWS_REGION=${region}"
  echo "AWS_DEFAULT_REGION=${region}"
} >>"${GITHUB_ENV}"
