#!/usr/bin/env bash
# Bottle Flip — run levelCheck.mjs for every level in parallel.
#   bash tools/checkAll.sh [from] [to]
cd "$(dirname "$0")"
FROM=${1:-1}; TO=${2:-50}
OUT=$(mktemp -d)
seq "$FROM" "$TO" | xargs -P "$(nproc)" -I{} sh -c "node levelCheck.mjs {} {} > $OUT/{}.txt 2>&1; echo \$? > $OUT/{}.rc"
fail=0
for i in $(seq "$FROM" "$TO"); do
  grep -v -e "^all levels OK" -e "problem(s)" -e "^$" "$OUT/$i.txt"
  [ "$(cat "$OUT/$i.rc")" != "0" ] && fail=$((fail+1))
done
rm -rf "$OUT"
echo; [ $fail -eq 0 ] && echo "ALL LEVELS OK" || echo "$fail level(s) with problems"
exit $fail
