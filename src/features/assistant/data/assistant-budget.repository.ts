import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { assistantError } from '../domain/assistant.error';
@Injectable()
export class AssistantBudgetRepository {
  constructor(private readonly prisma: PrismaService) {}
  async claim(day: string, limit: number): Promise<void> {
    // Reserved internal setting keys are excluded by PlatformService's public allowlist.
    // ON CONFLICT locks the counter row, so the daily cap survives restarts/replicas.
    const rows = await this.prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO platform_settings (key,value,updated_at)
      SELECT ${`internal:assistant:requests:${day}`},jsonb_build_object('count',1),now()
      WHERE ${limit}::integer > 0
      ON CONFLICT (key) DO UPDATE
        SET value=jsonb_build_object('count',(platform_settings.value->>'count')::integer+1),updated_at=now()
        WHERE (platform_settings.value->>'count')::integer < ${limit}::integer
      RETURNING key`;
    if (!rows.length)
      throw assistantError(
        429,
        'ASSISTANT_DAILY_LIMIT',
        'Assistant daily request limit reached. Browse services instead.',
      );
  }
}
