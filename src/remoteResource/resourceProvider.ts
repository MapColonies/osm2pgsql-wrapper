export interface IResourceProvider {
  getResource: (id: string) => Promise<string>;
}
