import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { adminWrite } from '../data/admin-errors';
import type { OfferInput } from '../domain/admin.schemas';
@Injectable()
export class AdminOfferService {
  constructor(private readonly db: PrismaService) {}
  private dto(row: Prisma.OfferGetPayload<object>) {
    return { ...row, discountValue: row.discountValue.toNumber() };
  }
  async list() {
    return (await this.db.offer.findMany({ orderBy: { id: 'asc' } })).map((r) =>
      this.dto(r),
    );
  }
  async get(id: string) {
    const row = await this.db.offer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Offer not found.');
    return this.dto(row);
  }
  save(id: string | undefined, input: Partial<OfferInput>) {
    return adminWrite(() =>
      this.db.$transaction(
        async (tx) => {
          const old = id ? await tx.offer.findUnique({ where: { id } }) : null;
          if (id && !old) throw new NotFoundException('Offer not found.');
          const merged = { ...old, ...input };
          const value = new Prisma.Decimal(merged.discountValue!);
          if (
            !merged.startsAt ||
            !merged.endsAt ||
            new Date(merged.startsAt) >= new Date(merged.endsAt) ||
            value.lte(0) ||
            (merged.discountType === 'PERCENTAGE' && value.gt(100))
          )
            throw new BadRequestException('Invalid offer period or discount.');
          if (
            !(await tx.service.findUnique({ where: { id: merged.serviceId! } }))
          )
            throw new BadRequestException('Invalid serviceId.');
          const data = {
            ...input,
            startsAt: new Date(merged.startsAt),
            endsAt: new Date(merged.endsAt),
          };
          return this.dto(
            id
              ? await tx.offer.update({ where: { id }, data })
              : await tx.offer.create({
                  data: data as Prisma.OfferUncheckedCreateInput,
                }),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }
}
