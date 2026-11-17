import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { loadAppConfig } from '../src/core/config/app-config';
import { AccessTokenService } from '../src/core/auth/services/access-token.service';
const environment={DATABASE_URL:'postgresql://test@localhost/test',AUTH_ACCESS_TOKEN_SECRET:randomBytes(48).toString('base64url')};
test('startup rejects missing secrets, arbitrary CORS origins and insecure cross-site cookies',()=>{
  assert.throws(()=>loadAppConfig({DATABASE_URL:environment.DATABASE_URL}));
  assert.throws(()=>loadAppConfig({...environment,CORS_ORIGINS:'*'}));
  assert.throws(()=>loadAppConfig({...environment,AUTH_COOKIE_SAME_SITE:'none',AUTH_COOKIE_SECURE:'false'}));
  assert.throws(()=>loadAppConfig({...environment,NODE_ENV:'production',CORS_ORIGINS:'https://autocare.example',AUTH_COOKIE_SECURE:'false'}));
  assert.equal(loadAppConfig(environment).auth.cookieSecure,false);
});
test('JWT roundtrip checks required claims, issuer, audience, signature and expiry',async()=>{
  const config=loadAppConfig(environment),access=new AccessTokenService(config);
  const userId=randomUUID(),sessionId=randomUUID();
  assert.deepEqual(await access.verify(await access.generate(userId,sessionId)),{userId,sessionId});
  const key=new TextEncoder().encode(config.auth.accessTokenSecret);
  const jwt=()=>new SignJWT({sid:sessionId,tokenType:'access'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(userId).setIssuer(config.auth.issuer).setAudience(config.auth.audience).setIssuedAt().setExpirationTime('5m').setJti(randomUUID());
  for(const token of [await jwt().setIssuer('wrong').sign(key),await jwt().setAudience('wrong').sign(key),await jwt().setExpirationTime(1).sign(key),await jwt().sign(randomBytes(48)),await new SignJWT({sid:sessionId,tokenType:'access'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(userId).setIssuer(config.auth.issuer).setAudience(config.auth.audience).setIssuedAt().setExpirationTime('5m').sign(key)]) await assert.rejects(()=>access.verify(token));
});
