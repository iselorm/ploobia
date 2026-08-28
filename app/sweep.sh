#!/usr/bin/env bash
# Sequential suite sweep. One node at a time — concurrent suites contend for
# CPU under SwiftShader and produce failures that are not real.
cd "$(dirname "$0")" || exit 1
OUT=/tmp/sweep.txt
: > "$OUT"
for s in "$@"; do
  echo "=== $s ===" >> "$OUT"
  timeout 1800 node "verify-$s.mjs" > "/tmp/suite-$s.log" 2>&1
  code=$?
  pass=$(grep -c '^PASS' "/tmp/suite-$s.log")
  fail=$(grep -c '^FAIL' "/tmp/suite-$s.log")
  skip=$(grep -c '^SKIP' "/tmp/suite-$s.log")
  echo "$s: exit=$code pass=$pass fail=$fail skip=$skip" >> "$OUT"
done
echo "SWEEP DONE" >> "$OUT"
