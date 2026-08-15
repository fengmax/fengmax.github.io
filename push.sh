#!/bin/bash
cd /tmp/spacekit-deploy
TOKEN=$(cat /home/ubuntu/.openclaw/secrets/github_token)
git remote set-url origin "https://fengmax:${TOKEN}@github.com/fengmax/fengmax.github.io.git"
git push origin main 2>&1 | tail -5
git remote set-url origin "https://github.com/fengmax/fengmax.github.io.git"
