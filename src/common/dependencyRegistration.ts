import { ClassProvider, container as defaultContainer, FactoryProvider, InjectionToken, ValueProvider, RegistrationOptions } from 'tsyringe';
import { constructor, DependencyContainer } from 'tsyringe/dist/typings/types';

export type Providers<T> = ValueProvider<T> | FactoryProvider<T> | ClassProvider<T> | constructor<T>;

export interface InjectionObject<T> {
  token: InjectionToken<T>;
  provider: Providers<T>;
  options?: RegistrationOptions;
  postInjectionSyncHook?: (container: DependencyContainer) => void;
}

export const registerDependencies = (
  dependencies: InjectionObject<unknown>[],
  override?: InjectionObject<unknown>[],
  useChild = false
): DependencyContainer => {
  const container = useChild ? defaultContainer.createChildContainer() : defaultContainer;
  for (const dependency of dependencies) {
    const injectionObject = override?.find((overrideObj) => overrideObj.token === dependency.token) ?? dependency;
    container.register(injectionObject.token, injectionObject.provider as constructor<unknown>, injectionObject.options);
    dependency.postInjectionSyncHook?.(container);
  }
  return container;
};
