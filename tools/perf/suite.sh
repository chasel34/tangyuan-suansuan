#!/bin/sh
cd "$(dirname "$0")"; export SCRATCH=$PWD
for i in 1 2 3 4 5; do node bench.mjs desktop 42 2>&1 | grep "desktop-\|ALL\|slow\|longt"; done
for i in 1 2 3; do node bench.mjs mobile 42 2>&1 | grep "mobile-\|ALL\|slow\|longt"; done
node keylat.mjs desktop 80; node keylat.mjs mobile 80
