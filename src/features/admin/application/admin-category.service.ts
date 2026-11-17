import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { adminWrite } from '../data/admin-errors';
import { slugify } from '../domain/admin.schemas';
import type { CategoryInput } from '../domain/admin.schemas';
@Injectable()
export class AdminCategoryService {
  constructor(private readonly db: PrismaService) {}
  list() {
    return this.db.serviceCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
  async get(id: string) {
    const row = await this.db.serviceCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Category not found.');
    return row;
  }
  create(input: CategoryInput) {
    return adminWrite(() =>
      this.db.serviceCategory.create({
        data: { ...input, slug: input.slug ?? slugify(input.name) },
      }),
    );
  }
  update(id: string, input: Partial<CategoryInput>) {
    return adminWrite(() =>
      this.db.serviceCategory.update({ where: { id }, data: input }),
    );
  }
}
