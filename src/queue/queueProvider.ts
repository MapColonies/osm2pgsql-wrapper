export interface QueueProvider {
  startQueue: () => Promise<void>;
  stopQueue: () => Promise<void>;
  push: (payload: object) => Promise<void>;
}
