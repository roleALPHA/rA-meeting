import React, { useContext } from 'react';
import type { PanelApi } from './browser/api';
const ApiContext = React.createContext<PanelApi | null>(null);
export const ApiProvider = ApiContext.Provider;
export function useApi(): PanelApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('Meeting host is required.');
  return api;
}
