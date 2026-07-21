import { apiClient } from './client';

export const complianceApi = {
  export() {
    return apiClient.post('/compliance/export');
  },
};
