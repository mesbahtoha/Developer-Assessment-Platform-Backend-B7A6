import 'dotenv/config';
import app from './app';
import { env } from './config/env';
import prisma from './shared/prisma';

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server running on port ${env.PORT} (${env.NODE_ENV})`);
});

const shutdown = async (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
