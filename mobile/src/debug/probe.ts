import { api } from '../config/api';

export async function probeBackend() {
  const health = await api.get('/health');
  console.log('[probe] health:', health);

  const list = await api.get('/restaurants');
  console.log('[probe] restaurants:', list.length, list?.[0]);
}
