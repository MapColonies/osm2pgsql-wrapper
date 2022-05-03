import { createHash } from 'crypto';
import { Logger } from '@map-colonies/js-logger';
import PgBoss from 'pg-boss';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { QueueError, RequestAlreadyInQueueError } from '../common/errors';
import { IConfig } from '../common/interfaces';
import { QueueProvider } from './queueProvider';

@injectable()
export class PgBossQueueProvider implements QueueProvider {
  private readonly queueName;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly pgBoss: PgBoss,
    @inject(SERVICES.CONFIG_STORE) configStore: IConfig
  ) {
    this.queueName = configStore.get<string>('queue.name');
  }

  public async startQueue(): Promise<void> {
    this.logger.info('starting pg-boss queue');

    this.pgBoss.on('error', (err) => {
      this.logger.error(err, 'pg-boss error');
    });

    try {
      await this.pgBoss.start();
    } catch (error) {
      const queueError = error as Error;
      this.logger.error(queueError);
      throw new QueueError(queueError.message);
    }
  }

  public async stopQueue(): Promise<void> {
    this.logger.info('stopping pg-boss queue');
    await this.pgBoss.stop();
  }

  public async push(payload: object): Promise<void> {
    this.logger.info(`pushing payload into ${this.queueName}`);

    const hash = createHash('md5');
    hash.update(JSON.stringify(payload));
    try {
      const response = await this.pgBoss.sendOnce(this.queueName, payload, {}, hash.digest('hex'));
      if (response === null) {
        throw new RequestAlreadyInQueueError(`request already in queue: ${this.queueName}`);
      }
    } catch (error) {
      const queueError = error as Error;
      throw new QueueError(queueError.message);
    }
  }
}
