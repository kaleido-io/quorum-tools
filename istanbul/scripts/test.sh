#!/bin/sh

NUM=3
if [ "$1" != "" ]; then
  NUM=$2
fi

echo "value is $NUM"
