#!/bin/sh
NUM=3
if [ "$1" != "" ]; then
  NUM=$2
fi

echo "Number of nodes: $NUM"

cd /ibft
/usr/local/bin/istanbul setup --num $NUM --nodes --verbose --docker-compose --quorum --save
