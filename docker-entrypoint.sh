#!/bin/sh
set -e

# Start the Node.js backend in the background
cd /app/backend
node server.js &

# Start nginx in the foreground
nginx -g 'daemon off;'
