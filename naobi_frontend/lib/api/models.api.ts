import { apiClient } from './client';
import type { PlaygroundModel } from '@/lib/types/playground-model';

export type ModelCatalogResponse = {
  object: 'list';
  data: PlaygroundModel[];
  catalog_status: 'available' | 'degraded';
  catalog_source?: 'live' | 'cache';
};

export const modelsApi = {
  list() {
    return apiClient.get<ModelCatalogResponse>('/models');
  },
};
