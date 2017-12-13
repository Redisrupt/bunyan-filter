import LineByLineReader from 'line-by-line';
import chalk from 'chalk';
import { deferred } from './deferred';
import { expand } from './expand';
import moment from 'moment';
import { resolve } from 'path';

const tryLoadFilterModule = filterModule => {
  /* eslint-disable global-require */
  let fn;

  try {
    fn = require(resolve(filterModule));
  } catch (err) {
    console.warn('Filter could not be loaded');
  }

  return fn;
};

const createFilters = args => {
  const { level, compare = 'gte', filter, defaultFilter, time, minBefore = 1, minAfter = 1, ...rest } = args;
  let { filterModule } = rest;

  const checks = [];
  let levelComparisonFn;

  const refTime = moment(time);
  const rangeBefore = refTime.clone().subtract(minBefore, 'minutes');
  const rangeAfter = refTime.clone().add(minAfter, 'minutes');

  if (level) {
    if (compare === 'eq') {
      levelComparisonFn = ent => ent.level === level;
    }
    if (compare === 'gt') {
      levelComparisonFn = ent => ent.level > level;
    }
    if (compare === 'lt') {
      levelComparisonFn = ent => ent.level < level;
    }
    if (compare === 'gte') {
      levelComparisonFn = ent => ent.level >= level;
    }
    if (compare === 'lte') {
      levelComparisonFn = ent => ent.level <= level;
    }

    checks.push(levelComparisonFn);
  }

  if (time) {
    checks.push(ent => {
      const d = moment(ent.time);
      return d.isSameOrAfter(rangeBefore) && d.isSameOrBefore(rangeAfter);
    });
  }

  if (defaultFilter) {
    filterModule = './logs-filter.js';
  }

  if (filterModule) {
    const filterFn = tryLoadFilterModule(filterModule);
    if (filterFn) {
      checks.push(filterFn);
    }
  }

  if (filter) {
    const filterFn = new Function('entity', 'line', filter); // eslint-disable-line no-new-func
    checks.push(filterFn);
  }

  return checks;
};

const processLogFile = (inputFile, checks) => {
  const dfd = deferred();

  if (!inputFile) throw new Error('Missing input file');

  const lr = new LineByLineReader(inputFile);

  lr.on('error', err => {
    console.error('some error ', err);
    dfd.reject(err);
  });

  const filter = (...args) => checks.reduce((acc, fn) => acc && fn(...args), true);

  let count = 0;
  const entries = [];

  lr.on('line', line => {
    // pause emitting of lines...
    lr.pause();
    line = `${line}`;
    const index = line.indexOf('{');
    if (index > -1) {
      const cleanLine = line.substring(index);

      let entity;
      try {
        entity = JSON.parse(cleanLine);
      } catch (err) {
        entity = {};
        console.log('>>>>>> error parsing JSON\n\n', line, '\n\n');
      }

      if (filter(entity, cleanLine)) {
        const { err, error, url, msg, time, ...rest } = entity;
        const entry = JSON.stringify(rest, null, 2);
        const theError = err || error;
        let before = url ? `url: ${url}\n` : '';

        before += msg ? `msg: ${msg}\n` : '';
        before += time ? `time: ${time}\n\n` : '';
        if (theError && theError.stack) {
          before += theError.stack ? `stack: ${theError.stack}\n\n` : '';
        }
        let log = `\n===============\n${before}${entry}\n\n===============\n\n`;

        if (entity.level === 50) {
          log = chalk.red(log);
        }
        count++;
        entries.push({ time: entity.time, log });
      }
    }

    lr.resume();
  });

  lr.on('end', () => {
    dfd.resolve({ entries, count });
  });

  return dfd;
};

const parseLogs = async ({ globs = ['./logs/**/*.log'], ...args } = {}) => {
  globs = Array.isArray(globs) ? globs : [globs];
  const files = await expand({ patterns: globs });
  let logEntriesCount = 0;

  const checks = createFilters(args);
  let allEntries = [];

  await files.reduce(
    (acc, file) =>
      acc.then(() =>
        processLogFile(file, checks).then(res => {
          const { count, entries } = res;
          logEntriesCount += count || 0;
          allEntries = allEntries.concat(entries);
        }),
      ),
    Promise.resolve(),
  );

  const sortedEntries = allEntries.sort((a, b) => (a.time < b.time ? -1 : 1)).map(entry => entry.log);
  process.stdout.write(sortedEntries.join('\n'));
  process.stdout.write(`total hits: ${logEntriesCount}\n\n`);
};

export default parseLogs;
