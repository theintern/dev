#!/usr/bin/env node

import { rm } from 'shelljs';
import { dirname, isAbsolute, join, relative } from 'path';
import { getConfigs, log, readTsconfigFile } from './common';

getConfigs()
  .map(configFile => {
    const config = readTsconfigFile(configFile);
    let outDir = config.options && config.options.outDir;
    if (outDir && !isAbsolute(outDir)) {
      outDir = join(dirname(configFile), outDir);
    }
    return outDir;
  })
  .filter(outDir => Boolean(outDir))
  .reduce((outDirs: string[], dir: string | undefined) => {
    if (dir && outDirs.indexOf(dir) === -1) {
      return [...outDirs, dir];
    }
    return outDirs;
  }, [])
  .forEach(outDir => {
    outDir = relative(process.cwd(), outDir);
    log(`Removing ${outDir}`);
    rm('-rf', outDir);
  });

log('Done cleaning');
