#!/bin/sh
exec /go/bin/dlv exec ./dist/main \
  --headless \
  --listen=:2345 \
  --api-version=2 \
  --accept-multiclient
