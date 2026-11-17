import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app/app.module';
import { AssistantModel } from '../src/features/assistant/domain/assistant.types';
import { AssistantService } from '../src/features/assistant/application/assistant.service';

// Run only against a seeded development database with a fake GEMINI_API_KEY.
// This uses the real orchestration/DTO validation but never contacts Google.
async function main() {
  if (process.env.GEMINI_API_KEY !== 'documentation-fake-provider')
    throw new Error(
      'Use GEMINI_API_KEY=documentation-fake-provider for this fixture export.',
    );
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    app.get(AssistantModel).generate = async (_request, context) =>
      JSON.stringify({
        text: 'Compare this existing package in the catalog.',
        actions: [
          {
            type: 'serviceDetails',
            serviceId: context.services.find(
              (s) => s.name === 'Express Car Care',
            )!.id,
          },
          { type: 'browseServices' },
        ],
      });
    const message = await app
      .get(AssistantService)
      .chat(
        {
          messages: [
            {
              role: 'user',
              content: 'Suggest an existing package under 2000 taka.',
            },
          ],
        },
        'documentation-fixture',
      );
    await writeFile(
      'docs/examples/assistant.json',
      JSON.stringify(message, null, 2) + '\n',
    );
  } finally {
    await app.close();
  }
}
void main();
