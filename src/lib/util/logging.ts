import chalk from 'chalk';
import { Observable } from 'rxjs';
import { promises } from 'fs';
import { LogLevel } from '../constants';

// eslint-disable-next-line
export async function writeState(values: Record<string, Observable<any>>, writeObs: Observable<any>, filename: string): Promise<void> {
  // eslint-disable-next-line
    const state: Record<string, any> = {};

  for (const key in values) {
    state[key] = '';
    values[key].subscribe((val) => state[key] = val);
  }

  const keys = Object.keys(state);
  await promises.writeFile(filename, keys.join(',') + '\n');

  writeObs.subscribe(async () => {
    await promises.appendFile(filename, keys.map((key) => (state[key] || '')).join(',') + '\n');
  });
}

export function log(level: LogLevel): (val: string) => void {
  switch (level) {
  case LogLevel.ERROR:
    return (val: string) => console.log(chalk.bgRed('ERROR:') + '  ', val);
  case LogLevel.WARN:
    return (val: string) => console.log(chalk.bgYellow('WARN:') + '   ', val);
  case LogLevel.SUCCESS:
    return (val: string) => console.log(chalk.bgGreen('SUCCESS:'), val);
  default:
    return (val: string) => console.log(chalk.bgBlue('INFO:') + '   ', val);
  }
}