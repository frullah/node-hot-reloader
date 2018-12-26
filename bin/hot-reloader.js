#!/usr/bin/env node

'use strict'

const yargs = require('yargs');
const hotReload = require('../lib');
const packageJson = require('../package.json');

// const usage = `Hot reload for nodejs
// Usage: $0 <entry-file> [...options]`;

const cli = yargs
  .options({
    watch: {
      alias: 'w',
      description: 'Watch path target',
      string: true,
      array: true,
      normalize: true,
    },
    verbose: {
      alias: 'V',
      description: 'Verbose all processed',
      boolean: true,
      default: true,
    },
  })
  .version(packageJson.version)
  .help();

const {argv} = cli;

if (argv._.length == 0) {
  console.log('Need entry file');
  process.exit(0);
}

hotReload.watch({
  targets: argv.watch,
  entryFile: argv._[0],
});