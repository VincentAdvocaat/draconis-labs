export const catalogPath = '/api/local/apps';

export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  owner: string;
  launchUrl: string;
  status: 'reachable' | 'unreachable';
}
