#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

rm -f drizzle/*.sql
rm -rf drizzle/meta

bun run db:generate
