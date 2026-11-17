import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBookingDate, insideBusinessHours, localInstant, workshopDate } from '../src/features/scheduling/domain/workshop-time';
test('Dhaka calendar boundaries and booking horizon',()=>{
  const now=new Date('2026-11-17T20:00:00Z');assert.equal(workshopDate(now),'2026-11-18');
  assert.doesNotThrow(()=>assertBookingDate('2026-11-18',30,now));assert.doesNotThrow(()=>assertBookingDate('2026-12-17',30,now));
  assert.throws(()=>assertBookingDate('2026-12-18',30,now));assert.throws(()=>assertBookingDate('2026-11-17',30,now));assert.throws(()=>assertBookingDate('2026-02-30',30,now));
});
test('opening intervals exclude breaks and allow an exact closing end',()=>{
  const hours=[{opensAt:'09:00',closesAt:'12:00',isClosed:false},{opensAt:'13:00',closesAt:'18:00',isClosed:false}];
  const at=(time:string)=>localInstant('2026-11-18',time);
  assert.equal(insideBusinessHours(at('11:15'),at('12:00'),hours),true);assert.equal(insideBusinessHours(at('11:30'),at('12:15'),hours),false);assert.equal(insideBusinessHours(at('17:30'),at('18:15'),hours),false);
});
