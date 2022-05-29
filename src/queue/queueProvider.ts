export interface QueueProvider {
  activeQueueName: string;
  startQueue: () => Promise<void>;
  stopQueue: () => Promise<void>;
  push: (payload: object) => Promise<void>;
}
