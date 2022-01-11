import fs from 'fs';
import fsPromises from 'fs/promises';
import * as stream from 'stream';
import { promisify } from 'util';

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
