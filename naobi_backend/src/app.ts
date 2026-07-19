import Koa, { Context } from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-body';
import helmet from 'koa-helmet';
import Router from '@koa/router';
import routes from './routes';
import { config } from './config/server';
import { swaggerSpec } from './config/swagger';
import { koaSwagger } from 'koa2-swagger-ui';
import { localeMiddleware } from './middleware/locale.middleware';
import './config/database';

const app = new Koa();
const router = new Router();

router.get('/health', (ctx: Context) => {
  ctx.body = {
    status: 'OK',
    service: 'noabi-gateway',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    environment: config.nodeEnv,
  };
});

router.get('/api', (ctx: Context) => {
  ctx.body = {
    message: 'noabi Gateway API',
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
      const allowedOrigins = [
        config.frontendUrl,
        'http://localhost:3002',
        'http://localhost:3000',
      ];
      const origin = ctx.request.header.origin;
      if (origin && (allowedOrigins.includes(origin) || config.nodeEnv === 'development')) {
        return origin;
      }
      return allowedOrigins[0];
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'X-Requested-With',
      'X-Org-ID',
      'X-API-Key',
    ],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400,
  }),
);
app.use(bodyParser({ jsonLimit: '10mb' }));
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
