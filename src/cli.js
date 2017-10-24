import minimist from 'minimist';
import processLogs from './process-logs';

const args = minimist(process.argv.slice(2));

processLogs(args)
  .then(() => {
    console.log('Done!');
  })
  .catch(err => console.error('Error', err));
