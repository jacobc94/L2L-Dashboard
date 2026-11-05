// Cloudflare Pages Function: every /api/* request. All logic lives in /server so it can be unit-tested.
import { handle } from '../../server/routes';
import type { Env } from '../../server/types';

export const onRequest = (context: { request: Request; env: Env }) => handle(context.request, context.env);
