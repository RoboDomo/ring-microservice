#!/bin/sh

if [ ! -f .env ]; then
  echo RING_TOKEN=$RING_TOKEN >.env
fi
chmod 666 .env
ls -ldg .env

./node_modules/.bin/nodemon  ./index.js
