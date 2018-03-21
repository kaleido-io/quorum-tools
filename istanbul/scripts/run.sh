#!/bin/sh
NUM=3
if [ "$1" != "" ]; then
  NUM=$2
fi

cd /ibft
/usr/local/bin/istanbul setup --num $NUM --nodes --verbose --docker-compose --quorum --save
