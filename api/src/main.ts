/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import { AppModule } from './app/app.module';
import { configureApp, GLOBAL_PREFIX } from './app/configure';

/**
 * Loads api/.env, then a .env in the working directory.
 *
 * `process.loadEnvFile` is built into Node, so this needs no dotenv dependency.
 * It never overwrites a variable that is already set, which gives the ordering
 * we want: an inline `PORT=3005 nx serve` beats api/.env, which beats the root
 * .env. The bundle runs from api/dist, so api/.env is one level up — resolving
 * it from __dirname rather than the cwd matters because `nx serve` runs from
 * the workspace root.
 */
function loadEnvFiles(): void {
  for (const path of [join(__dirname, '..', '.env'), '.env']) {
    try {
      process.loadEnvFile(path);
    } catch {
      // Absent or unreadable: fall through to the next candidate.
    }
  }
}

async function bootstrap() {
  loadEnvFiles();

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`,
  );
}

bootstrap();
