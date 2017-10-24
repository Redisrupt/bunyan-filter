import globModule from 'glob';
import thenify from './thenify';
import { join } from 'path';
import difference from 'lodash/difference';
import union from 'lodash/union';
// import { difference, union } from 'lodash'; // eslint-disable-line red/no-lodash
import { homedir } from 'os';

const glob = thenify(globModule);

const globExclude = async pattern => {
  const exclude = pattern.indexOf('!') === 0;
  if (exclude) {
    pattern = pattern.slice(1);
  }

  const hasTilde = pattern.indexOf('~') === 0;

  if (hasTilde) {
    pattern = join(homedir(), pattern.slice(1));
  }

  return {
    result: await glob(pattern),
    exclude,
  };
};

export const expand = async ({ patterns }) => {
  const results = await Promise.all(
    patterns.reduce((acc, p) => {
      if (p) {
        acc.push(globExclude(p));
      }
      return acc;
    }, []),
  );

  const matches = results.reduce((acc, { result, exclude }) => {
    if (exclude) {
      acc = difference(acc, result);
    } else {
      acc = union(acc, result);
    }

    return acc;
  }, []);

  return matches.sort();
};
