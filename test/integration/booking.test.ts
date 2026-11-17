import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/bootstrap';
import { PrismaService } from '../../src/core/database/prisma.service';
import { AvailabilityService } from '../../src/features/scheduling/application/availability.service';
import { workshopDate } from '../../src/features/scheduling/domain/workshop-time';
import type { AppointmentDto } from '../../src/features/appointments/domain/appointment.types';
import { seed } from '../../prisma/seed';
import type { ServiceDto } from '../../src/features/catalog/domain/catalog.types';

test('availability, owned appointments and database concurrency constraints', {skip:!process.env.TEST_DATABASE_URL},async()=>{
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.NODE_ENV='test';process.env.AUTH_ACCESS_TOKEN_SECRET=randomBytes(48).toString('base64url');
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{bodyParser:false,logger:false});configureApp(app);await app.listen(0,'127.0.0.1');
  const base=`${await app.getUrl()}/api/v1`,db=app.get(PrismaService),availability=app.get(AvailabilityService);
  const userIds:string[]=[];
  const date=workshopDate(new Date(Date.now()+86400000));
  const request=async(path:string,token:string,body?:unknown,method?:string)=>fetch(base+path,{method:method??(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try {
    await seed(db);
    const users=[];
    for(let i=0;i<2;i++) {
      const response=await request('/auth/register','',{name:'Booking test',email:`booking-${randomBytes(8).toString('hex')}@example.invalid`,password:'long-test-password'});
      assert.equal(response.status,201);const data=await response.json() as {user:{id:string};accessToken:string};userIds.push(data.user.id);users.push(data);
    }
    const token=users[0].accessToken,other=users[1].accessToken;
    const services=await (await fetch(base+'/services')).json() as ServiceDto[];
    const wash=services.find(s=>s.slug==='exterior-wash')!,battery=services.find(s=>s.slug==='battery-check')!,premium=services.find(s=>s.slug==='premium-car-care')!;
    const first=await availability.getAvailability(wash.id,date),second=await availability.getAvailability(wash.id,date);
    assert.ok(first.slots.length>0);assert.deepEqual(first.slots,second.slots);
    assert.ok(first.slots.every(s=>new Date(s.endsAt).getTime()-new Date(s.startsAt).getTime()===45*60000));
    assert.ok(first.slots.every(s=>{const local=s.workshopTime.slice(11,16);return local>='09:00'&&(local<'12:00'||local>='13:00');}));
    assert.equal((await fetch(base+`/services/${wash.id}/availability?date=2026-02-30`)).status,400);
    assert.equal((await fetch(base+`/services/${wash.id}/availability?date=2099-01-01`)).status,400);
    const slot=first.slots[0];
    const race=await Promise.all([request('/appointments',token,{serviceId:wash.id,slotId:slot.id}),request('/appointments',token,{serviceId:wash.id,slotId:slot.id})]);
    assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
    const booked=await race.find(r=>r.status===201)!.json() as AppointmentDto;
    assert.equal(booked.status,'pending');assert.equal(booked.price,650);assert.equal(booked.slot.startsAt,slot.startsAt);
    assert.equal((await request(`/appointments/${booked.id}`,other)).status,404);
    assert.equal((await request(`/appointments/${booked.id}/cancel`,other,{},'PATCH')).status,404);
    const refreshed=await availability.getAvailability(wash.id,date);
    assert.equal(refreshed.slots.find(s=>s.id===slot.id)!.available,false);
    const dbSlot=await db.appointmentSlot.findUniqueOrThrow({where:{id:slot.id}});
    await availability.getAvailability(battery.id,date);
    const crossSlot=await db.appointmentSlot.findFirstOrThrow({where:{serviceId:battery.id,bayId:dbSlot.bayId,startsAt:dbSlot.startsAt}});
    const cross=await request('/appointments',token,{serviceId:battery.id,slotId:crossSlot.id});
    assert.equal(cross.status,409,await cross.text());
    assert.equal((await availability.getAvailability(battery.id,date)).slots.find(s=>s.id===crossSlot.id)!.available,false);
    assert.equal((await request('/appointments',token,{serviceId:battery.id,slotId:slot.id})).status,404);
    assert.equal((await request('/appointments',token,{serviceId:wash.id,slotId:slot.id,price:1})).status,400);
    const foreignVehicle=await db.vehicle.create({data:{userId:users[1].user.id,make:'Demo',model:'Car'}});
    assert.equal((await request('/appointments',token,{serviceId:wash.id,slotId:slot.id,vehicleId:foreignVehicle.id})).status,404);
    await db.vehicle.delete({where:{id:foreignVehicle.id}});
    // Back-to-back intervals on the same bay are permitted.
    const adjacent=await db.appointmentSlot.findFirstOrThrow({where:{serviceId:battery.id,bayId:dbSlot.bayId,startsAt:dbSlot.endsAt}});
    assert.equal((await request('/appointments',token,{serviceId:battery.id,slotId:adjacent.id})).status,201);
    const cancelled=await request(`/appointments/${booked.id}/cancel`,token,{},'PATCH');assert.equal(cancelled.status,200);
    assert.equal((await cancelled.json() as AppointmentDto).status,'cancelled');
    assert.equal((await availability.getAvailability(wash.id,date)).slots.find(s=>s.id===slot.id)!.available,true);
    const rebook=await request('/appointments',token,{serviceId:wash.id,slotId:slot.id});assert.equal(rebook.status,201);
    const rebooked=await rebook.json() as AppointmentDto;
    await db.appointment.update({where:{id:rebooked.id},data:{status:'CONFIRMED'}});
    assert.equal((await request(`/appointments/${rebooked.id}/cancel`,token,{},'PATCH')).status,409);
    const packageSlots=await availability.getAvailability(premium.id,date);
    const packageSlot=packageSlots.slots.find(s=>s.available)!;
    assert.ok(packageSlot);
    const packageBooking=await request('/appointments',token,{serviceId:premium.id,slotId:packageSlot.id});assert.equal(packageBooking.status,201);
    const packageAppointment=await packageBooking.json() as AppointmentDto;assert.equal(packageAppointment.price,3300);assert.equal(packageAppointment.originalPrice,3500);assert.equal(packageAppointment.durationMinutes,210);
    await db.service.update({where:{id:premium.id},data:{price:'9999',name:'Changed name'}});
    try { const history=await (await request(`/appointments/${packageAppointment.id}`,token)).json() as AppointmentDto;assert.equal(history.price,3300);assert.equal(history.serviceName,'Premium Car Care'); }
    finally {await db.service.update({where:{id:premium.id},data:{price:'3500',name:'Premium Car Care'}});}
    const upcoming=await (await request('/appointments?period=upcoming',token)).json() as AppointmentDto[];assert.ok(upcoming.every(a=>['pending','confirmed'].includes(a.status)));
    const cancelledList=await (await request('/appointments?status=cancelled',token)).json() as AppointmentDto[];assert.equal(cancelledList.length,1);
    const privateList=await (await request('/appointments',other)).json() as AppointmentDto[];assert.equal(privateList.length,0);
    // Bypass the application to verify the database constraint itself rejects overlaps.
    const record=await db.appointment.findUniqueOrThrow({where:{id:rebooked.id}});
    const {id:_id,createdAt:_created,updatedAt:_updated,...data}=record;
    await assert.rejects(()=>db.appointment.create({data:{...data,slotId:crossSlot.id,serviceId:battery.id}}));
  } finally {
    await db.appointment.deleteMany({where:{userId:{in:userIds}}});
    await db.user.deleteMany({where:{id:{in:userIds}}});
    await app.close();
  }
});
