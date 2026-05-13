#!/usr/bin/env bash
# Mac Mini wrapper for the Valhalla video renderer (workers-v2).
#
# Loaded by ~/Library/LaunchAgents/com.justinharris.valhalla-video-worker.plist.
# Resolves Supabase secrets from the JHAI vault, then execs `pnpm workers:v2`.
#
# Author: Baldr / Volundr (S20 Phase 6 deploy, 2026-04-30)
# Host: Mac Mini ONLY. INV-2 forbids persistent services on the MacBook;
#       INV-3 forbids scheduled tasks on the Mac Mini, but a long-running
#       poll-based worker is a persistent service, not a scheduled task.

set -euo pipefail

# Paths are absolute to make launchd happy (no $HOME expansion in plist).
JHAI_ROOT="${HOME}/code/JustinHarris.AI"
BUILD_DIR="${JHAI_ROOT}/clients/justinharris-ai/builds/talking-head-video-builder"
VAULT_READ="${JHAI_ROOT}/agents/vault-keeper/scripts/vault-read.sh"
ENV_CACHE="${HOME}/.config/valhalla-video-worker/env"

if [ ! -d "${BUILD_DIR}" ]; then
    echo "[start-worker] build dir missing at ${BUILD_DIR}" >&2
    exit 1
fi

# Secrets resolution priority:
#   1. Local env cache at ${ENV_CACHE} (used by launchd; macOS TCC blocks
#      launchd-spawned processes from reading Google Drive's secrets.enc).
#   2. Vault on Drive (works for interactive shells; populates the cache).
if [ -f "${ENV_CACHE}" ]; then
    # shellcheck disable=SC1090
    set -a
    . "${ENV_CACHE}"
    set +a
elif [ -f "${VAULT_READ}" ]; then
    SUPABASE_URL=$(bash "${VAULT_READ}" SUPABASE_URL)
    SUPABASE_SERVICE_KEY=$(bash "${VAULT_READ}" SUPABASE_SERVICE_KEY)
    export SUPABASE_URL SUPABASE_SERVICE_KEY
else
    echo "[start-worker] no env cache and no vault-read.sh; cannot resolve secrets" >&2
    exit 1
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
    echo "[start-worker] SUPABASE_URL or SUPABASE_SERVICE_KEY empty after resolution" >&2
    exit 1
fi

# Worker tunables (override here, not in the plist, so plist stays generic).
export VIDEOS_BUCKET="${VIDEOS_BUCKET:-videos-public}"
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-10000}"
export WORK_DIR="${WORK_DIR:-${HOME}/Library/Caches/valhalla-video-worker}"
mkdir -p "${WORK_DIR}"

# pnpm needs PATH; launchd starts with a minimal env. Homebrew default + asdf
# default + corepack-managed pnpm shim, in priority order.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.asdf/shims:${HOME}/.local/bin:${PATH}"

cd "${BUILD_DIR}"
exec pnpm workers:v2
