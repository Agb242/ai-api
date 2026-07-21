import { apiClient } from './client';

export const auditApi = {
  list(params?: { source?: string; page?: number; limit?: number }) {
    return apiClient.get('/audit', { params });
  },
  exportCsvUrl(source = 'all') {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';
    return `${base}/audit/export.csv?source=${encodeURIComponent(source)}`;
  },
};
