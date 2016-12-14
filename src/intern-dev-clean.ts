#!/usr/bin/env node 

import { echo, rm } from 'shelljs';
import { buildDir } from './common';

echo(`## Removing ${buildDir}`);
rm('-rf', buildDir);

echo('## Done cleaning');
