#!/bin/bash

# SPDX-FileCopyrightText: 2026 Triplebit Corporation
# SPDX-License-Identifier: AGPL-3.0-only

# Setup script for a Claude Code on the web environment (Ubuntu, runs as root before a session).
# Paste it into the environment's "Setup script" field. Not needed on a developer machine.
# shortcut: never run in a real cloud environment yet; fix it here when the first run shows what fails.
set -e
apt-get update
apt-get install -y zip unzip openssl librsvg2-bin gh   # build.mjs zips; smoke test makes a certificate; rsvg-convert renders icon.svg
npm install -g web-ext                                  # Mozilla's lint, as in .github/workflows/build.yml
# Chrome for Testing plus its system libraries, for smoke/chrome.mjs. The version matches smoke/package.json.
npx --yes puppeteer@23.11.1 browsers install chrome --install-deps
