import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/core/database/prisma.service';
import { CatalogService } from '../src/features/catalog/application/catalog.service';
import { AvailabilityService } from '../src/features/scheduling/application/availability.service';
import { AppointmentService } from '../src/features/appointments/application/appointment.service';
import { PlatformService } from '../src/features/platform/platform.service';
import { workshopDate } from '../src/features/scheduling/domain/workshop-time';

async function main() {
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
  const db=app.get(PrismaService);
  let fixtureUserId:string|undefined;
  try {
    const catalog=await app.get(CatalogService).listServices();
    const premium=catalog.find(s=>s.slug==='premium-car-care');
    if (!premium) throw new Error('Seed demonstration data before exporting examples.');
    const date=workshopDate(new Date(Date.now()+86400000));
    const availability=await app.get(AvailabilityService).getAvailability(premium.id,date);
    const slot=availability.slots.find(s=>s.available);
    if (!slot) throw new Error('No fixture slot available.');
    const user=await db.user.create({data:{name:'Documentation fixture',email:`docs-${randomUUID()}@example.invalid`,passwordHash:'disabled-documentation-fixture'}});
    fixtureUserId=user.id;
    const appointment=await app.get(AppointmentService).create(user.id,{serviceId:premium.id,slotId:slot.id});
    const examples={catalog,platform:await app.get(PlatformService).getPublicKnowledge(),availability,appointment};
    await mkdir('docs/examples',{recursive:true});
    for (const [name,value] of Object.entries(examples)) await writeFile(`docs/examples/${name}.json`,JSON.stringify(value,null,2)+'\n');
  } finally {
    if (fixtureUserId) {await db.appointment.deleteMany({where:{userId:fixtureUserId}});await db.user.delete({where:{id:fixtureUserId}});}
    await app.close();
  }
}
void main();
