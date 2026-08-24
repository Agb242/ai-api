import Koa, { Context } from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-body';
import helmet from 'koa-helmet';
import Router from '@koa/router';
import routes from './routes';
import { config, isAllowedCorsOrigin, CORS_ALLOW_HEADERS } from './config/server';
import { swaggerSpec } from './config/swagger';
import { koaSwagger } from 'koa2-swagger-ui';
import { localeMiddleware } from './middleware/locale.middleware';
import './config/database';

const app = new Koa();
const router = new Router();

router.get('/health', (ctx: Context) => {
  ctx.body = {
    status: 'OK',
    service: 'knotflow-gateway',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    environment: config.nodeEnv,
  };
});

router.get('/api', (ctx: Context) => {
  ctx.body = {
    message: 'knotflow Gateway API',
    version: config.apiVersion,
    documentation: `${config.domain}/api/docs`,
  };
});

router.get('/api/docs/swagger.json', (ctx: Context) => {
  ctx.body = swaggerSpec;
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (ctx) => {
      const origin = ctx.request.header.origin;
      if (origin && isAllowedCorsOrigin(origin)) return origin;
      return config.frontendUrl;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: CORS_ALLOW_HEADERS,
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400,
  }),
);
app.use(
  bodyParser({
    multipart: true,
    jsonLimit: '25mb',
    formLimit: '25mb',
    textLimit: '25mb',
    formidable: {
      maxFileSize: 25 * 1024 * 1024,
      keepExtensions: true,
    },
  }),
);

// Capture raw JSON body for webhook HMAC (after parse, reconstruct is last resort).
app.use(async (ctx, next) => {
  if (
    ctx.method === 'POST' &&
    /billing\/webhook|webhooks\/momo|\/webhook/i.test(ctx.path) &&
    ctx.request.body &&
    typeof (ctx.request as any).rawBody !== 'string'
  ) {
    try {
      (ctx.request as any).rawBody = JSON.stringify(ctx.request.body);
    } catch {
      /* ignore */
    }
  }
  await next();
});
app.use(localeMiddleware);

app.use(routes.routes());
app.use(routes.allowedMethods());

app.use(router.routes());
app.use(router.allowedMethods());

app.use(
  koaSwagger({
    routePrefix: '/api/docs',
    swaggerOptions: {
      url: '/api/docs/swagger.json',
    },
  }),
);

app.use((ctx: Context) => {
  ctx.status = 404;
  ctx.body = {
    error: {
      message: 'Route not found',
      status: 404,
    },
  };
});

export default app;
