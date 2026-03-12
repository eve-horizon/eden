#!/bin/sh
set -e

# Substitute environment variables in the nginx config template.
# API_SERVICE_HOST is the k8s service DNS name for the API container
# (e.g., "sandbox-api" in the sandbox environment).
envsubst '${API_SERVICE_HOST}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
