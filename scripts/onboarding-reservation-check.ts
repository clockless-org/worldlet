import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {reservationSite} from './fixtures/onboarding/reservation-site.ts';
const directory=await mkdtemp(path.join(os.tmpdir(),'worldlet-reservation-'));
const browser=await chromium.launch();let site=await reservationSite(directory);
try{
 for(let round=0;round<3;round++){
  const page=await browser.newPage();const started=performance.now();
  await page.goto(site.url+'/reservation/workshop-42');
  if(round===0){await page.getByRole('button',{name:'Confirm attendance'}).click();}
  await page.getByText('Attendance confirmed. Reference: RSVP-0042',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirm attendance'}).isVisible(),false);
  // Replaying a response after an uncertain transport outcome cannot double-submit.
  await fetch(site.url+'/api/confirm',{method:'POST'});
  const receipt=await (await fetch(site.url+'/api/reservation')).json();
  assert.equal(receipt.submissions,1);assert.equal(receipt.reference,'RSVP-0042');
  console.log(JSON.stringify({round:round+1,pageAndReceiptMs:Math.round(performance.now()-started),status:receipt.status,submissions:receipt.submissions}));
  await page.close();await site.close();site=await reservationSite(directory);
 }
 console.log('PASS fictional reservation: visible result, persistent receipt, repeat/restart without duplicate submission. This check does not exercise Hermes or the Mac onboarding guide.');
}finally{await browser.close();await site.close();await rm(directory,{recursive:true,force:true});}
