import { getAuth } from '@tor-sockets/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(getAuth());
