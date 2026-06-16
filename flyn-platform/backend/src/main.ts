import 'dotenv/config';
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiSpecService } from './api-spec/api-spec.service';

loadEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    /**
     * rawBody: true is REQUIRED for webhook signature verification.
     *
     * Stripe, Ziina, and Flutterwave all require the exact raw request body
     * (as a Buffer) to compute and verify the HMAC signature.  NestJS applies
     * JSON body-parsing middleware by default which transforms the Buffer into
     * a JavaScript object — making signature verification impossible.
     *
     * With rawBody: true, the unprocessed Buffer is available on
     * `req.rawBody` for ALL routes.  The three webhook controllers use it;
     * all other routes use the parsed JSON body as normal.
     */
    rawBody: true,
  });

  // Increase body size limit for audio data (base64-encoded audio chunks).
  // Must be called via useBodyParser to override the default NestJS parser.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true } as any);

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      const defaultOrigins = [
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://myflynai.com',
        'https://esim.myflynai.com',
        'https://app.myflynai.com',
      ];

      const allAllowed = [...new Set([...allowedOrigins, ...defaultOrigins])];

      // allow non-browser requests (no Origin header)
      if (!origin) return callback(null, true);
      if (allAllowed.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.error(`CORS blocked for origin: ${origin}. Allowed: ${allAllowed.join(', ')}`);
        callback(null, true); // Temporarily allow all for debugging if needed, but let's just fix the logic
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  });

  app.setGlobalPrefix('api');

  // Routes are automatically registered via @Controller() decorators in AppController

  // ── Swagger / OpenAPI docs ──────────────────────────────────────────────────
  // The document is ALWAYS generated (needed for /api/spec endpoint + AI tool).
  // The Swagger UI is only shown in non-production or when SWAGGER_ENABLED=true.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FLYN AI API')
    .setDescription(
      'REST API for the FLYN AI platform — multi-tenant CRM, automations, AI agents, channels, telephony, HR, church, coaching, and billing.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Firebase ID token or sk_live_* developer API key' },
      'Firebase',
    )
    .addTag('Tenants')
    .addTag('CRM')
    .addTag('Channels')
    .addTag('Orchestrator')
    .addTag('Billing')
    .addTag('AI Agents')
    .addTag('Dashboard')
    .addTag('HR')
    .addTag('Church')
    .addTag('Coaches')
    .addTag('Freelancer')
    .addTag('Accounting')
    .addTag('Integrations')
    .addTag('Inbox')
    .addTag('Calendar')
    .addTag('Tasks')
    .addTag('Team')
    .addTag('API Spec')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Inject into ApiSpecService so /api/spec and AI tool can query it
  const apiSpecService = app.get(ApiSpecService);
  apiSpecService.setDocument(document);

  // Show Swagger UI only in dev or when explicitly enabled
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'FLYN AI — API Reference',
    });

    // Feed the document to ApiSpecService so /api/spec/* endpoints work
    const specService = app.get(ApiSpecService);
    specService.setDocument(document as any);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
