#!/bin/bash
# 可靠推送脚本: 用命令替换读token, 存入变量, 再构造URL
set -e
cd /tmp/spacekit-deploy
TOKEN=$(cat /home/ubuntu/.openclaw/secrets/github_token)
git remote set-url origin "https://fengmax:${TOKEN}@github.com/fengmax/fengmax.github.io.git"
git push origin main 2>&1 | tail -4
git remote set-url origin "https://github.com/fengmax/fengmax.github.io.git"
