import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CatalogService } from '../../catalog/application/catalog.service';
import {
  CatalogRepository,
  catalogRecord,
} from '../../catalog/data/catalog.repository';
import { adminWrite } from '../data/admin-errors';
import { slugify } from '../domain/admin.schemas';
import type { ServiceInput } from '../domain/admin.schemas';
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly db: PrismaService,
    private readonly catalog: CatalogService,
  ) {}
  private dto(
    row: Prisma.ServiceGetPayload<{
      include: typeof CatalogRepository.bookingInclude;
    }>,
  ) {
    return {
      ...this.catalog.toDto(catalogRecord(row)),
      price: row.price.toNumber(),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  async list() {
    return (
      await this.db.service.findMany({
        include: CatalogRepository.bookingInclude,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => this.dto(row));
  }
  async get(id: string) {
    const row = await this.db.service.findUnique({
      where: { id },
      include: CatalogRepository.bookingInclude,
    });
    if (!row) throw new NotFoundException('Service not found.');
    return this.dto(row);
  }
  async save(id: string | undefined, input: Partial<ServiceInput>) {
    const saved = await adminWrite(() =>
      this.db.$transaction(
        async (tx) => {
          const old = id
            ? await tx.service.findUnique({
                where: { id },
                include: { packageItems: true, includedIn: true },
              })
            : null;
          if (id && !old) throw new NotFoundException('Service not found.');
          const type = input.type ?? old?.type;
          if (
            old &&
            type !== old.type &&
            (old.packageItems.length || old.includedIn.length)
          )
            throw new ConflictException(
              'Cannot change the type of a composed service.',
            );
          const categoryId = input.categoryId ?? old?.categoryId;
          if (
            !categoryId ||
            !(await tx.serviceCategory.findUnique({
              where: { id: categoryId },
            }))
          )
            throw new BadRequestException('Invalid categoryId.');
          const items = input.packageItems ?? old?.packageItems ?? [];
          if (type === 'PACKAGE') {
            if (
              !items.length ||
              new Set(items.map((i) => i.serviceId)).size !== items.length ||
              items.some((i) => i.serviceId === id)
            )
              throw new BadRequestException(
                'Supply unique individual package items.',
              );
            const count = await tx.service.count({
              where: {
                id: { in: items.map((i) => i.serviceId) },
                type: 'INDIVIDUAL',
              },
            });
            if (count !== items.length)
              throw new BadRequestException(
                'Package items must reference existing individual services.',
              );
          } else if (items.length)
            throw new BadRequestException(
              'Individual services cannot contain package items.',
            );
          const { packageItems: _items, ...fields } = input;
          void _items;
          const row = old
            ? await tx.service.update({ where: { id: old.id }, data: fields })
            : await tx.service.create({
                data: {
                  ...fields,
                  slug: input.slug ?? slugify(input.name!),
                  categoryId,
                } as Prisma.ServiceUncheckedCreateInput,
              });
          if (input.packageItems !== undefined || !old) {
            await tx.packageItem.deleteMany({ where: { packageId: row.id } });
            if (items.length)
              await tx.packageItem.createMany({
                data: items.map((i) => ({
                  packageId: row.id,
                  serviceId: i.serviceId,
                  quantity: i.quantity,
                })),
              });
          }
          if (
            old &&
            input.durationMinutes !== undefined &&
            input.durationMinutes !== old.durationMinutes
          ) {
            await tx.$executeRaw`UPDATE appointment_slots SET ends_at = starts_at + (${input.durationMinutes} * interval '1 minute') WHERE service_id = ${old.id}::uuid AND starts_at > now()`;
          }
          return this.dto(
            await tx.service.findUniqueOrThrow({
              where: { id: row.id },
              include: CatalogRepository.bookingInclude,
            }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    return saved;
  }
}
