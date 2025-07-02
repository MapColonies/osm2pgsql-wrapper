import fs from 'fs';
import fsPromises from 'fs/promises';
import * as stream from 'stream';
import { promisify } from 'util';
import readline from 'readline';
import { EnrollmentStatus } from '../httpClient/mdrClient';
import {
  DIFF_BOTTOM_DIR_DIVIDER,
  DIFF_STATE_FILE_MODULO,
  DIFF_TOP_DIR_DIVIDER,
  SEQUENCE_NUMBER_PADDING_AMOUNT,
  SEQUENCE_NUMBER_REGEX,
} from './constants';
import { Sort } from './types';

const finished = promisify(stream.finished);

export const streamToString = async (stream: NodeJS.ReadStream): Promise<string> => {
  return new Promise((resolve, reject) => {
    stream.setEncoding('utf8');
    let data = '';
    stream.on('data', (chunk) => (data += chunk.toString()));
    stream.on('error', reject);
    stream.on('end', () => resolve(data));
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

export const streamToFs = async (stream: NodeJS.ReadStream, path: string): Promise<void> => {
  const writeStream = fs.createWriteStream(path, { encoding: 'binary' });
  stream.pipe(writeStream);
  return finished(writeStream);
};

export const applyFuncLineByLine = async (inputStream: NodeJS.ReadableStream, func: (line: string) => void): Promise<void> => {
  const readLineInterface = readline.createInterface({
    input: inputStream,
  });

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

export const getDiffDirPathComponents = (sequenceNumber: number): [string, string, string] => {
  const top = sequenceNumber / DIFF_TOP_DIR_DIVIDER;
  const bottom = (sequenceNumber % DIFF_TOP_DIR_DIVIDER) / DIFF_BOTTOM_DIR_DIVIDER;
  const state = sequenceNumber % DIFF_STATE_FILE_MODULO;
  return [top, bottom, state].map((component: number) => {
    const floored = Math.floor(component);
    return floored.toString().padStart(SEQUENCE_NUMBER_PADDING_AMOUNT, '0');
  }) as [string, string, string];
};

export const fetchSequenceNumber = (content: string): number => {
  const matchResult = content.match(SEQUENCE_NUMBER_REGEX);
  if (matchResult === null || matchResult.length === 0) {
    throw new Error();
  }

  const sequenceNumberDeclaration = matchResult[0];
  const sequenceNumber = sequenceNumberDeclaration.split('=')[1] as string;

  return parseInt(sequenceNumber);
};

export const streamToUniqueLines = async (stream: NodeJS.ReadableStream): Promise<string[]> => {
  const lines = new Set<string>();
  await applyFuncLineByLine(stream, (line) => {
    lines.add(line);
  });

  return Array.from(lines);
};

export const sortArrAlphabetically = (arr: string[], sort?: Sort): string[] => {
  return arr.sort((a, b) => (sort === 'desc' ? b.localeCompare(a) : a.localeCompare(b)));
};

export const getMdrEnrollmentRange = (pre: EnrollmentStatus, post: EnrollmentStatus): { from: number; to: number } => {
  const from = pre.latest !== undefined ? pre.latest + 1 : 0;
  const to = post.latest as number;
  return { from, to };
};
