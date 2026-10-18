#!/bin/sh
# 复制资源到唯一目录，绕过内置浏览器缓存；输出预览路径
V=$(date +%s)
cd /var/minis/workspace || exit 1
rm -rf sheep_dev_*
D="sheep_dev_$V"
mkdir "$D" && cp sheep/app/src/main/assets/* "$D/"
echo "minis://workspace/$D/index.html"
