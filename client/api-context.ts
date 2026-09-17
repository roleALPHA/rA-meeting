import React, { useContext } from 'react';
import type { AppApi } from './browser/runtime';
const ApiContext = React.createContext<AppApi | null>(null);
export const ApiProvider = ApiContext.Provider;
export function useApi(): AppApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('Meeting host is required.');
  return api;
}
