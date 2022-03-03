import fs from 'fs';
import fsPromises from 'fs/promises';
import * as stream from 'stream';
import { promisify } from 'util';
import readline from 'readline';
import {
  DIFF_BOTTOM_DIR_DIVIDER,
  DIFF_STATE_FILE_MODULO,
  DIFF_TOP_DIR_DIVIDER,
  SEQUENCE_NUMBER_PADDING_AMOUNT,
  SEQUENCE_NUMBER_REGEX,
} from './constants';

const finished = promisify(stream.finished);

export const streamToString = async (stream: NodeJS.ReadStream): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
};

export const getFileDirectory = (filePath: string): string => {
  const filePathArray = filePath.split('/');
  filePathArray.pop();
  return filePathArray.join('/');
};

export const createDirectory = async (dir: string): Promise<void> => {
  if (fs.existsSync(dir)) {
    return;
  }
  await fsPromises.mkdir(dir, { recursive: true });
};

export const isStringEmptyOrUndefined = (input: string | undefined): boolean => {
  if (input === undefined || input === '') {
    return true;
  }
  return false;
};

export const removeDuplicates = <T>(input: T[]): T[] => input.filter((value, index) => input.indexOf(value) === index);

export const streamToFs = async (stream: NodeJS.ReadStream, path: string): Promise<void> => {
  const writeStream = fs.createWriteStream(path, { encoding: 'binary' });
  stream.pipe(writeStream);
  return finished(writeStream);
};

export const applyFuncLineByLine = async (inputStream: NodeJS.ReadableStream, func: (line: string) => void): Promise<void> => {
  const readLineInterface = readline.createInterface({
    input: inputStream,
  });

  // TODO: needed or can be accomplished by line event?
  for await (const line of readLineInterface) {
    func(line);
  }
};

export const valuesToRange = (start: number, end?: number): string => {
  if (end === undefined) {
    return start.toString();
  }
  return `${start}-${end}`;
};

export const getDiffDirPathComponents = (sequenceNumber: number): string[] => {
  const top = sequenceNumber / DIFF_TOP_DIR_DIVIDER;
  const bottom = (sequenceNumber % DIFF_TOP_DIR_DIVIDER) / DIFF_BOTTOM_DIR_DIVIDER;
  const state = sequenceNumber % DIFF_STATE_FILE_MODULO;
  return [top, bottom, state].map((component: number) => {
    const floored = Math.floor(component);
    return floored.toString().padStart(SEQUENCE_NUMBER_PADDING_AMOUNT, '0');
  });
};

export const fetchSequenceNumber = (content: string): number => {
  const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
  if (matchResult === null || matchResult.length === 0) {
    throw new Error();
  }

  return parseInt(matchResult[0].split('=')[1]);
};
