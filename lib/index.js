/**
 * @typedef {{id: string, parent?: CacheModule}} CacheModule
 */

const chalk = require('chalk');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');


const defaultEntry = {
  listeners: {}
};

/**
 * @param {Object} params
 * @param {string} params.entryFile
 * @param {string[]} params.targets
 * @param {boolean} [params.silent=false]
 * @return {Object}
 */
function watch(params) {
  if (typeof params.entryFile != 'string') {
    throw new TypeError('type of parameter `entryFile` must string');
  }

  const verbose = params.verbose === false ? false : true;
  let {
    cwd,
    targets,
    entryFile
  } = params;

  if (typeof cwd != 'string') {
    cwd = process.cwd();
  }

  if (targets == null) {
    targets = [cwd];
  } else if (typeof targets == 'string') {
    targets = [targets];
  } else if (!Array.isArray(params.targets)) {
    throw new TypeError('type of parameter `targets` must Array, string or empty');
  }

  entryFile = path.resolve(cwd, entryFile);
  try {
    const entryFileStat = fs.statSync(entryFile);

    if (entryFileStat.isDirectory()) {
      const packageJsonPath = path.resolve(entryFile, 'package.json');
      // const fd = fs.openSync(packageJsonPath, 'r');
      const packageJsonContent = fs.readFileSync(packageJsonPath);
      // fs.closeSync(fd);
      const packageJson = JSON.parse(packageJsonContent);

      if (typeof packageJson.main != 'string') {
        throw new Error('entryFile not found');
      }

      entryFile = path.resolve(entryFile, packageJson.main);
    }
  } catch (error) {
    throw error;
  }

  let crashed = false;
  let changedFiles = {};
  let entry = defaultEntry;
  let restarting = false;
  let needRestart = false;
  let changedFileQueue = {};

  for (let i = 0; i < targets.length; i++) {
    targets[i] = path.resolve(cwd, targets[i]);
  }

  const watchers = chokidar.watch(targets, {
    awaitWriteFinish: {
      stabilityThreshold: 10
    }
  });
  watchers.on('error', watcherOnError);
  watchers.on('ready', watcherOnReady);

  return {
    targets,
  };

  /**
   * 
   */
  function watcherOnReady() {
    start();

    watchers.on('all', watcherOnAll);
  }

  /**
   * triggered when watcher error
   * @param {Error} err 
   */
  function watcherOnError(err) {
    console.error(chalk.redBright('[hot-reloader - error on watcher]:',
      err.stack || err));
  }

  /**
   * triggered when watcher has detects
   * @param {string} event
   * @param {string} watchedPath
   */
  function watcherOnAll(event, watchedPath) {
    if (verbose) {
      const label = event === 'add' ? 'new file' :
        event === 'addDir' ? 'new directory' :
        event === 'change' ? 'changes' :
        event === 'unlink' ? 'deleted file' :
        event === 'unlinkDir' ? 'deleted directory' :
        null;

      if (label != null) {
        console.log(chalk.greenBright('[hot-reloader]',
          label,
          'on',
          watchedPath));
      }
    }

    if (watchedPath === entryFile) {
      fullReload();
      return;
    }

    const moduleCache = require.cache[watchedPath];
    if (moduleCache == null &&
      (!crashed || changedFiles[watchedPath] == null)) return;

    if (!restarting) {
      changedFiles[watchedPath] = true;
      hotReload();
    } else {
      changedFileQueue[watchedPath] = true;
      needRestart = false;
    }

    restarting = true;
  }

  /**
   * Start the entry file
   */
  async function start() {
    const timeString = new Date().toLocaleTimeString();

    if (verbose) {
      console.log(chalk.greenBright(`[hot-reloader][${timeString}]`,
        `starting ${entryFile}`));
    }

    try {
      entry = require(entryFile);

      if (entry == null) {
        entry = defaultEntry;
      } else {
        if (entry.listeners == null) {
          entry.listeners = defaultEntry.listeners;
        }
      }

      if (typeof entry.listeners.start == 'function') {
        const entryResult = entry.listeners.start();
        if (isPromise(entryResult)) {
          try {
            await entryResult;
          } catch (error) {
            console.error(error);
          }
        }
      }

      if (verbose) {
        console.log(chalk.greenBright(`[hot-reloader]`,
          `done, waiting for changes...`));
      }
    } catch (e) {
      crashed = true;
      console.error(chalk.redBright(e.stack || e));
      if (verbose) {
        console.error(chalk.yellowBright('[hot-reloader]',
          'crashed, waiting for changes...'));
      }
    }
  }

  /**
   * Full reload, will reload all used module
   */
  async function fullReload() {
    restarting = true;

    /**
     * Delete all module cache, except node_modules
     */
    for (const moduleCacheId in require.cache) {
      if (moduleCacheId !== require.main.filename &&
        !moduleCacheId.includes('node_modules')) {
        require.cache[moduleCacheId] = null;
      }
    }

    await reloadEntry();
  }

  /**
   * Reload entry file
   */
  async function reloadEntry() {
    require.cache[entryFile] = null;

    if (entry != null) {
      if (typeof entry.onBeforeRestart == 'function') {
        const result = entry.onBeforeRestart();

        if (isPromise(result)) await result;
      }
    }

    if (await start() === true) {
      changedFiles = changedFileQueue;
      changedFileQueue = {};
    }

    restarting = false;
    /** possible  */
    if (needRestart) {
      needRestart = false;
      hotReload();
    }
  }

  /**
   * Reload script
   */
  async function hotReload() {
    /**
     * Delete used module
     */
    // eslint-disable-next-line guard-for-in
    for (const key in changedFiles) {
      /**
       * @type {CacheModule}
       */
      let currentCache = require.cache[key];

      while (currentCache != null) {
        require.cache[currentCache.id] = null;
        currentCache = currentCache.parent;
      }
    }

    reloadEntry();
  }
}

/**
 * Check if value is promise
 * @param {*} value
 * @return {Boolean}
 */
function isPromise(value) {
  return (value != null) && (value.constructor.name === 'Promise');
}

module.exports = {
  watch,
};