import { expand } from './expand';
import { resolve } from 'path';
import { deferred } from './deferred';

import LineByLineReader from 'line-by-line';
import chalk from 'chalk';
import moment from 'moment';

const tryLoadFilterModule = filterModule => {
  /* eslint-disable global-require */
  let fn;

  try {
    fn = require(resolve(filterModule));
  } catch (err) {
    console.log('Error loading filter', err);
  }

  return fn;
};

const createFilters = args => {
  const { level, compare = 'gte', filterModule = './logs-filter.js', time, minBefore = 1, minAfter = 1 } = args;
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
      return d.isAfter(rangeBefore) && d.isBefore(rangeAfter);
    });
  }

  if (filterModule) {
    const filterFn = tryLoadFilterModule(filterModule);
    if (filterFn) {
      checks.push(filterFn);
    }
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

  const filter = entity => checks.reduce((acc, fn) => acc && fn(entity), true);
  // const date = moment(entity.time);
  // const ref = moment('2017-10-14T20:58:39.690Z');
  // const rangeA = ref.clone().subtract(1, 'minutes');
  // const rangeB = ref.clone().add(0, 'minutes');

  // return (
  //   // (entity.url || '').indexOf('/partyDetails/') > -1 &&
  //   (entity.msg || '').indexOf('getAllScreeningResultsForParty') > -1 && entity.name === 'api' && date.isAfter(rangeA) && date.isBefore(rangeB)
  // );

  // return true;

  let count = 0;

  lr.on('line', line => {
    // pause emitting of lines...
    lr.pause();
    line = `${line}`;
    const index = line.indexOf('{');
    if (index > -1) {
      const cleanLine = line.substring(index);
      const entity = JSON.parse(cleanLine);

      if (filter(entity)) {
        const entry = entity.level === 50 ? JSON.stringify(entity, null, 2) : JSON.stringify(entity);
        let before = entity.url ? `url: ${entity.url}\n` : '';
        before += entity.msg ? `msg: ${entity.msg}\n` : '';
        before += entity.time ? `time: ${entity.time}\n\n` : '';
        let log = `\n===============\n${before}${entry}\n\n===============\n\n`;

        if (entity.level === 50) {
          log = chalk.red(log);
        }
        count++;
        process.stdout.write(log);
      }
    }

    lr.resume();
  });

  lr.on('end', () => {
    dfd.resolve(count);
  });

  return dfd;
};

const parseLogs = async ({ globs = ['./logs/**/*.log'], ...args } = {}) => {
  globs = Array.isArray(globs) ? globs : [globs];
  const files = await expand({ patterns: globs });
  let errors = 0;

  const checks = createFilters(args);

  await files.reduce(
    (acc, file) =>
      acc.then(() =>
        processLogFile(file, checks).then(errCount => {
          errors += errCount || 0;
        }),
      ),
    Promise.resolve(),
  );

  console.error('>>>> total entries', errors);
};

export default parseLogs;
