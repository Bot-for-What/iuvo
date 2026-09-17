#!/bin/sh
set -eu

echo "Applying database migrations..."
npm run migrate:latest

echo "Starting backend..."
exec npm start
