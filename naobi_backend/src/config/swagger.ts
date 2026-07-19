import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'noabi Gateway API',
      version: '1.0.0',
      description: 'Unified LLM gateway — auth, API keys, wallet, filters, OpenAI-compatible chat completions',
    },
    servers: [
      {
        url: 'http://localhost:3018',
        description: 'Development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Session token from OTP / Google auth',
        },
        apiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key (sk-...) for /v1/chat/completions',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
